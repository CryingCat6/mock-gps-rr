import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;

class WazeNavigationService {
  static const String _baseUrl = 'https://www.waze.com';
  static const Map<String, String> _headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.waze.com/live-map/',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
  };

  /// Instant Autocomplete search for Malaysia
  Future<List<Map<String, dynamic>>> searchPlaces(
      String query, double userLat, double userLng) async {
    if (query.trim().isEmpty) return [];

    try {
      final String url =
          '$_baseUrl/SearchServer/mozi?q=${Uri.encodeComponent(query)}&lang=en&lon=$userLng&lat=$userLat&origin=livemap';

      final response = await http.get(Uri.parse(url), headers: _headers);

      if (response.statusCode == 200) {
        final List<dynamic> data = json.decode(response.body);
        return data.where((item) => item['location'] != null).map((item) {
          return {
            'name': item['name'] ?? 'Unknown Place',
            'address': item['address'] ?? 'No address provided',
            'lat': item['location']['lat'],
            'lon': item['location']['lon'],
          };
        }).toList();
      }
    } catch (e) {
      print('Waze Search Error: $e');
    }
    return [];
  }

  /// High-precision road route for Malaysia (PLUS, urban, kampung)
  Future<Map<String, dynamic>> getDetailedRoute(
      double startLat, double startLng, double endLat, double endLng) async {
    try {
      final String url =
          '$_baseUrl/RoutingManager/routingRequest?from=x:$startLng+y:$startLat&to=x:$endLng+y:$endLat&returnJSON=true&returnGeometries=true&returnInstructions=true&timeout=60000&nPaths=1&options=AVOID_TRAILS%3Atrue';

      final response = await http.get(Uri.parse(url), headers: _headers);

      if (response.statusCode == 200) {
        final Map<String, dynamic> data = json.decode(response.body);
        
        final route = data['response'];
        if (route != null) {
          final int totalTime = route['totalTime'] ?? 0;
          final int totalDistance = route['totalLength'] ?? 0;
          
          List<Map<String, double>> coords = [];
          if (route['routeGeometry']?['objects'] != null) {
            final List<dynamic> objects = route['routeGeometry']['objects'];
            coords = objects.map((obj) {
              return {
                'lat': (obj['y'] as num).toDouble(),
                'lng': (obj['x'] as num).toDouble(),
              };
            }).toList().cast<Map<String, double>>();
          }

          // Calculate base speed
          double baseSpeedKmh = totalDistance > 0 ? (totalDistance / 1000) / (totalTime / 3600) : 0;
          
          return {
            'coordinates': coords,
            'totalTime': totalTime,
            'totalDistance': totalDistance,
            'baseSpeedKmh': baseSpeedKmh,
            'status': baseSpeedKmh < 40 ? 'Heavy Traffic' : (baseSpeedKmh < 70 ? 'Moderate' : 'Smooth'),
          };
        }
      }
    } catch (e) {
      print('Waze Routing Error: $e');
    }
    return {};
  }
}
