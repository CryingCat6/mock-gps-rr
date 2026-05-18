import 'dart:async';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:geolocator/geolocator.dart';
import './services/waze_service.dart';
import './screens/waze_search_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeService();
  runApp(const MyApp());
}

Future<void> initializeService() async {
  final service = FlutterBackgroundService();

  const AndroidNotificationChannel channel = AndroidNotificationChannel(
    'gps_mock_foreground',
    'GPS Mock Service',
    description: 'Running GPS spoofing simulation',
    importance: Importance.low,
  );

  final FlutterLocalNotificationsPlugin flutterLocalNotificationsPlugin =
      FlutterLocalNotificationsPlugin();

  await flutterLocalNotificationsPlugin
      .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>()
      ?.createNotificationChannel(channel);

  await service.configure(
    androidConfiguration: AndroidConfiguration(
      onStart: onStart,
      autoStart: false,
      isForegroundMode: true,
      notificationChannelId: 'gps_mock_foreground',
      initialNotificationTitle: 'GPS Mock Active',
      initialNotificationContent: 'Simulating route...',
      foregroundServiceNotificationId: 888,
    ),
    iosConfiguration: IosConfiguration(
      autoStart: false,
      onForeground: onStart,
      onBackground: (service) => true,
    ),
  );
}

@pragma('vm:entry-point')
void onStart(ServiceInstance service) async {
  DartPluginRegistrant.ensureInitialized();

  final MethodChannel channel = const MethodChannel('com.palsu.gps/mock');
  final wazeService = WazeNavigationService();
  List<Map<String, double>> currentRoute = [];
  int currentIndex = 0;
  Timer? simulationTimer;

  service.on('startSimulation').listen((event) async {
    final startLat = event?['startLat'] as double;
    final startLng = event?['startLng'] as double;
    final endLat = event?['endLat'] as double;
    final endLng = event?['endLng'] as double;

    try {
      final route = await wazeService.getDetailedRoute(startLat, startLng, endLat, endLng);

      if (route.isNotEmpty) {
        currentRoute = route;
        currentIndex = 0;
        simulationTimer?.cancel();

        simulationTimer = Timer.periodic(const Duration(seconds: 1), (timer) async {
          if (currentIndex < currentRoute.length) {
            final point = currentRoute[currentIndex];
            
            try {
              await channel.invokeMethod('hantarKoordinatKeAndroid', {
                'lat': point['lat'],
                'lng': point['lng'],
              });
              
              service.invoke('updatePreview', {
                'currentLat': point['lat'],
                'currentLng': point['lng'],
                'index': currentIndex,
                'total': currentRoute.length,
              });
              
              currentIndex++;
            } on PlatformException catch (e) {
              service.invoke('error', {'message': e.message});
              timer.cancel();
            }
          } else {
            timer.cancel();
            service.invoke('simulationFinished');
          }
        });
      }
    } catch (e) {
      service.invoke('error', {'message': 'Routing failed: $e'});
    }
  });

  service.on('stopSimulation').listen((event) {
    simulationTimer?.cancel();
    service.stopSelf();
  });
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark.copyWith(statusBarColor: Colors.transparent),
      child: MaterialApp(
        title: 'SimuDrive GPS',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xFF1A73E8),
            brightness: Brightness.light,
          ),
          useMaterial3: true,
          scaffoldBackgroundColor: const Color(0xFFFDFCF0),
          fontFamily: 'Inter',
        ),
        home: const SimuDriveMainScreen(),
      ),
    );
  }
}

class SimuDriveMainScreen extends StatefulWidget {
  const SimuDriveMainScreen({super.key});

  @override
  State<SimuDriveMainScreen> createState() => _SimuDriveMainScreenState();
}

class _SimuDriveMainScreenState extends State<SimuDriveMainScreen> with SingleTickerProviderStateMixin {
  final MapController _mapController = MapController();
  final WazeNavigationService _wazeService = WazeNavigationService();
  late AnimationController _pulseController;
  
  LatLng? _startLoc;
  LatLng? _endLoc;
  String _startName = "Your location";
  String _endName = "Where to, bro?";
  
  List<LatLng> _routePoints = [];
  bool _isSimulating = false;
  bool _isSatelliteMode = false;
  int _currentIndex = 0;
  LatLng? _currentMockPos;
  Timer? _simulationTimer;
  
  double _userSelectedSpeed = 80.0;
  Map<String, dynamic>? _currentRouteData;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);
    _getCurrentLocation(true);
  }

  @override
  void dispose() {
    _pulseController.dispose();
    _simulationTimer?.cancel();
    super.dispose();
  }

  String _formatDuration(double seconds) {
    Duration duration = Duration(seconds: seconds.round());
    if (duration.inHours > 0) {
      return "${duration.inHours} hr ${duration.inMinutes.remainder(60)} min";
    }
    return "${duration.inMinutes} min";
  }

  Future<void> _getCurrentLocation(bool isStart) async {
    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) return;

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) return;
      }

      final pos = await Geolocator.getCurrentPosition();
      if (mounted) {
        setState(() {
          final latLng = LatLng(pos.latitude, pos.longitude);
          if (isStart) {
            _startLoc = latLng;
            _startName = "Current Location";
          } else {
            _endLoc = latLng;
            _endName = "Current Location";
          }
          _mapController.move(latLng, 15);
        });
      }
    } catch (e) {
      debugPrint("Location error: $e");
    }
  }

  void _showLayerPicker() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (context) => Container(
        padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.only(left: 4, bottom: 20),
              child: Text("Pilih Jenis Peta", style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold, color: Color(0xFF3C4043))),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.start,
              children: [
                _buildLayerOption("Plain", Icons.map_outlined, !_isSatelliteMode, () {
                  setState(() => _isSatelliteMode = false);
                  Navigator.pop(context);
                }),
                const SizedBox(width: 32),
                _buildLayerOption("Satellite", Icons.satellite_alt, _isSatelliteMode, () {
                  setState(() => _isSatelliteMode = true);
                  Navigator.pop(context);
                }),
              ],
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildLayerOption(String label, IconData icon, bool active, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: active ? const Color(0xFFE8F0FE) : const Color(0xFFF8F9FA),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: active ? const Color(0xFF1A73E8) : Colors.transparent, width: 2),
            ),
            child: Icon(icon, color: active ? const Color(0xFF1A73E8) : const Color(0xFF5F6368), size: 26),
          ),
          const SizedBox(height: 10),
          Text(label, style: TextStyle(fontSize: 13, color: active ? const Color(0xFF1A73E8) : const Color(0xFF3C4043), fontWeight: active ? FontWeight.bold : FontWeight.w500)),
        ],
      ),
    );
  }

  Future<void> _pickLocation(bool isStart) async {
    final result = await Navigator.push(
      context,
      MaterialPageRoute(builder: (context) => WazeSearchScreen(
        onLocationSelected: (lat, lon, name) {
          Navigator.pop(context, {'lat': lat, 'lng': lon, 'name': name});
        },
      )),
    );
    if (result != null) {
      setState(() {
        if (isStart) {
          _startLoc = LatLng(result['lat'], result['lng']);
          _startName = result['name'];
        } else {
          _endLoc = LatLng(result['lat'], result['lng']);
          _endName = result['name'];
        }
        _routePoints = [];
        _currentRouteData = null;
      });
      if (_startLoc != null && _endLoc != null) {
        _generateRoute();
      }
    }
  }

  Future<void> _generateRoute() async {
    if (_startLoc == null || _endLoc == null) return;
    final data = await _wazeService.getDetailedRoute(
      _startLoc!.latitude, _startLoc!.longitude,
      _endLoc!.latitude, _endLoc!.longitude,
    );
    if (data.isNotEmpty) {
      setState(() {
        _currentRouteData = data;
        _routePoints = (data['coordinates'] as List).map((p) => LatLng(p['lat'], p['lng'])).toList();
      });
      _mapController.move(_routePoints.first, 15);
    }
  }

  void _startSimulation() {
    if (_routePoints.isEmpty || _currentRouteData == null) return;
    setState(() {
      _isSimulating = true;
      _currentIndex = 0;
    });
    
    final int totalTime = _currentRouteData!['totalTime'];
    final double baseSpeed = (_currentRouteData!['baseSpeedKmh'] as num).toDouble();
    
    _simulationTimer?.cancel();
    _simulationTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (_currentIndex < _routePoints.length - 1) {
        if (mounted) {
          setState(() {
            double multiplier = baseSpeed > 0 ? _userSelectedSpeed / baseSpeed : 1.0;
            double ptsPerSec = (_routePoints.length / (totalTime > 0 ? totalTime : 1)) * multiplier;
            _currentIndex += ptsPerSec.round().clamp(1, _routePoints.length);
            if (_currentIndex >= _routePoints.length) _currentIndex = _routePoints.length - 1;
            _currentMockPos = _routePoints[_currentIndex];
            _mapController.move(_currentMockPos!, 17);
          });
        }
      } else {
        _stopSimulation();
      }
    });
  }

  void _stopSimulation() {
    _simulationTimer?.cancel();
    setState(() {
      _isSimulating = false;
      _currentIndex = 0;
      _currentMockPos = null;
    });
  }

  LatLng get center => _currentMockPos ?? _startLoc ?? const LatLng(3.1390, 101.6869);

  @override
  Widget build(BuildContext context) {
    final bool hasRoute = _routePoints.isNotEmpty;
    
    double adjustedDuration = 0;
    if (_currentRouteData != null) {
      double baseSpeed = (_currentRouteData!['baseSpeedKmh'] as num).toDouble();
      double multiplier = baseSpeed > 0 ? _userSelectedSpeed / baseSpeed : 1.0;
      adjustedDuration = (_currentRouteData!['totalTime'] as int) / multiplier;
    }

    return Scaffold(
      backgroundColor: const Color(0xFFFDFCF0), // Creamy off-white
      body: Stack(
        children: [
          // 1. FULLSCREEN MAP
          FlutterMap(
            mapController: _mapController,
            options: MapOptions(
              center: center, 
              zoom: 15,
              maxZoom: 18,
              minZoom: 5,
            ),
            children: [
              TileLayer(
                urlTemplate: _isSatelliteMode 
                  ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                  : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
                subdomains: const ['a', 'b', 'c', 'd'],
                userAgentPackageName: 'com.palsu.gps',
              ),
              if (hasRoute)
                PolylineLayer(
                  polylines: [
                    Polyline(
                      points: _routePoints.sublist(0, _currentIndex.clamp(0, _routePoints.length)),
                      color: Colors.white.withOpacity(0.9),
                      strokeWidth: 10,
                    ),
                    Polyline(
                      points: _routePoints.sublist(_currentIndex.clamp(0, _routePoints.length)),
                      color: const Color(0xFF1E8E3E).withOpacity(0.7),
                      strokeWidth: 10,
                    ),
                    Polyline(
                      points: _routePoints.sublist(_currentIndex.clamp(0, _routePoints.length)),
                      color: const Color(0xFF4285F4).withOpacity(0.85),
                      strokeWidth: 6,
                    ),
                  ],
                ),
              MarkerLayer(
                markers: [
                  if (_startLoc != null && !_isSimulating)
                    Marker(
                      point: _startLoc!,
                      width: 40, height: 40,
                      child: const Icon(Icons.location_on, color: Color(0xFF34A853), size: 36),
                    ),
                  if (_endLoc != null)
                    Marker(
                      point: _endLoc!,
                      width: 40, height: 40,
                      child: const Icon(Icons.location_on, color: Color(0xFFEA4335), size: 36),
                    ),
                  Marker(
                    point: center,
                    width: 120, height: 120,
                    child: _isSimulating 
                      ? AnimatedBuilder(
                          animation: _pulseController,
                          builder: (context, child) {
                            return Center(
                              child: Stack(
                                alignment: Alignment.center,
                                children: [
                                  Container(
                                    width: 24 + (48 * _pulseController.value),
                                    height: 24 + (48 * _pulseController.value),
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: const Color(0xFF4285F4).withOpacity(0.2 * (1 - _pulseController.value)),
                                      boxShadow: [
                                        BoxShadow(
                                          color: const Color(0xFF4285F4).withOpacity(0.4),
                                          blurRadius: 15,
                                          spreadRadius: 2,
                                        )
                                      ]
                                    ),
                                  ),
                                  Container(
                                    width: 24, height: 24,
                                    decoration: BoxDecoration(
                                      color: const Color(0xFF4285F4),
                                      shape: BoxShape.circle,
                                      border: Border.all(color: Colors.white, width: 3.5),
                                      boxShadow: const [
                                        BoxShadow(color: Colors.black26, blurRadius: 6, offset: Offset(0, 3)),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            );
                          },
                        )
                      : Container(), 
                  ),
                ],
              ),
            ],
          ),

          // 2. SEARCH BAR (Floating Top)
          AnimatedPositioned(
            duration: const Duration(milliseconds: 500),
            curve: Curves.easeInOutQuart,
            top: _isSimulating ? -100 : 54,
            left: 16, right: 16,
            child: Container(
              height: 48,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(24),
                boxShadow: const [
                  BoxShadow(color: Colors.black12, blurRadius: 6, offset: Offset(0, 2)),
                ],
              ),
              child: Row(
                children: [
                  const Padding(padding: EdgeInsets.only(left: 16, right: 12), child: Icon(Icons.menu, color: Color(0xFF70757A), size: 24)),
                  Expanded(
                    child: GestureDetector(
                      onTap: () => _pickLocation(false),
                      child: Text(
                        _endLoc != null ? _endName : "Where to, bro?", 
                        style: const TextStyle(color: Color(0xFF70757A), fontSize: 16), 
                        overflow: TextOverflow.ellipsis
                      ),
                    ),
                  ),
                  const Icon(Icons.mic, color: Color(0xFF70757A), size: 22),
                  const SizedBox(width: 12),
                  Container(
                    width: 32, height: 32,
                    margin: const EdgeInsets.only(right: 8),
                    decoration: const BoxDecoration(
                      color: Color(0xFFE8EAED),
                      shape: BoxShape.circle,
                      image: DecorationImage(
                        image: NetworkImage("https://ui-avatars.com/api/?name=User&background=random"),
                        fit: BoxFit.cover,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // 3. RIGHT SIDE UTILITY BUTTONS
          Positioned(
            right: 12,
            bottom: 260,
            child: Column(
              children: [
                _buildUtilityButton(Icons.layers_outlined, _showLayerPicker),
                const SizedBox(height: 10),
                _buildUtilityButton(Icons.explore_outlined, () => _mapController.rotate(0)),
                const SizedBox(height: 10),
                _buildUtilityButton(
                  Icons.my_location_rounded, 
                  () => _mapController.move(center, 16), 
                  color: const Color(0xFF1A73E8)
                ),
              ],
            ),
          ),

          // 4. BOTTOM PANEL
          DraggableScrollableSheet(
            initialChildSize: 0.28,
            minChildSize: 0.12,
            maxChildSize: 0.5,
            builder: (context, scrollController) {
              return Container(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
                  boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.08), blurRadius: 10, offset: const Offset(0, -2))],
                ),
                child: ListView(
                  controller: scrollController,
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  children: [
                    const SizedBox(height: 10),
                    Center(child: Container(width: 36, height: 4, decoration: BoxDecoration(color: const Color(0xFFE8EAED), borderRadius: BorderRadius.circular(2)))),
                    const SizedBox(height: 24),
                    
                    if (!_isSimulating) ...[
                      // --- STATE A: SETUP MODE ---
                      Row(
                        children: [
                          Column(
                            children: [
                              const Icon(Icons.radio_button_checked, size: 16, color: Color(0xFF4285F4)),
                              Container(width: 2, height: 46, decoration: const BoxDecoration(color: Color(0xFFE8EAED))),
                              const Icon(Icons.location_on, size: 18, color: Color(0xFFEA4335)),
                            ],
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              children: [
                                _buildInputBox("Lokasi Mula", _startName, () => _pickLocation(true)),
                                const SizedBox(height: 8),
                                _buildInputBox("Lokasi Tamat", _endName, () => _pickLocation(false)),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 24),
                      ElevatedButton(
                        onPressed: hasRoute ? _startSimulation : _generateRoute,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF1A73E8),
                          foregroundColor: Colors.white,
                          minimumSize: const Size(double.infinity, 50),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(25)),
                          elevation: 0,
                        ),
                        child: Text(hasRoute ? "START" : "PREVIEW LALUAN", style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, letterSpacing: 0.5)),
                      ),
                    ] else ...[
                      // --- STATE B: ACTIVE DRIVING MODE ---
                      Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                RichText(
                                  text: TextSpan(
                                    children: [
                                      TextSpan(
                                        text: _formatDuration(adjustedDuration),
                                        style: const TextStyle(color: Color(0xFF1E8E3E), fontSize: 26, fontWeight: FontWeight.bold),
                                      ),
                                      const TextSpan(text: "  "),
                                      if (_currentRouteData != null)
                                        TextSpan(
                                          text: "• ${(_currentRouteData!['totalDistance'] / 1000).toStringAsFixed(0)} km",
                                          style: const TextStyle(color: Color(0xFF70757A), fontSize: 18, fontWeight: FontWeight.normal),
                                        ),
                                    ],
                                  ),
                                ),
                                const SizedBox(height: 4),
                                const Text("Laluan terpantas berdasarkan trafik sekarang", style: TextStyle(color: Color(0xFF70757A), fontSize: 13)),
                              ],
                            ),
                          ),
                          GestureDetector(
                            onTap: _stopSimulation,
                            child: Container(
                              width: 48, height: 48,
                              decoration: const BoxDecoration(color: Color(0xFFD93025), shape: BoxShape.circle),
                              child: const Icon(Icons.close, color: Colors.white, size: 26),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 24),
                      Row(
                        children: [
                          const Icon(Icons.speed, size: 20, color: Color(0xFF5F6368)),
                          const SizedBox(width: 8),
                          Text("${_userSelectedSpeed.round()} km/j", style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Color(0xFF3C4043))),
                          const Spacer(),
                          const Text("Adjust Kelajuan", style: TextStyle(fontSize: 11, color: Color(0xFF70757A))),
                        ],
                      ),
                      Slider(
                        value: _userSelectedSpeed,
                        min: 30, max: 140,
                        activeColor: const Color(0xFF1A73E8),
                        inactiveColor: const Color(0xFFF1F3F4),
                        onChanged: (val) => setState(() => _userSelectedSpeed = val),
                      ),
                    ],
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildUtilityButton(IconData icon, VoidCallback onTap, {Color color = const Color(0xFF5F6368)}) {
    return Container(
      width: 44, height: 44,
      margin: const EdgeInsets.only(bottom: 2),
      decoration: BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.12), blurRadius: 4, offset: const Offset(0, 2))],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(22),
          child: Icon(icon, color: color, size: 22),
        ),
      ),
    );
  }

  Widget _buildInputBox(String label, String text, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: const Color(0xFFF1F3F4),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: const TextStyle(color: Color(0xFF70757A), fontSize: 10, fontWeight: FontWeight.bold)),
            const SizedBox(height: 2),
            Text(text, style: const TextStyle(color: Color(0xFF202124), fontSize: 14), overflow: TextOverflow.ellipsis),
          ],
        ),
      ),
    );
  }
}

