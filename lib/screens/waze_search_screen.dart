import 'dart:async';
import 'package:flutter/material.dart';
import '../services/waze_service.dart';

class WazeSearchScreen extends StatefulWidget {
  final String label;
  final Function(double lat, double lng, String name) onLocationSelected;

  const WazeSearchScreen({
    super.key,
    this.label = "Search",
    required this.onLocationSelected,
  });

  @override
  State<WazeSearchScreen> createState() => _WazeSearchScreenState();
}

class _WazeSearchScreenState extends State<WazeSearchScreen> {
  final TextEditingController _controller = TextEditingController();
  final WazeNavigationService _wazeService = WazeNavigationService();
  List<Map<String, dynamic>> _results = [];
  bool _isLoading = false;
  Timer? _debounce;

  void _onSearchChanged(String query) {
    if (_debounce?.isActive ?? false) _debounce!.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      if (query.isNotEmpty) {
        _performSearch(query);
      } else {
        setState(() => _results = []);
      }
    });
  }

  Future<void> _performSearch(String query) async {
    setState(() => _isLoading = true);
    // Kulim center as default priority for search
    final results = await _wazeService.searchPlaces(query, 5.3670, 100.5431);
    setState(() {
      _results = results;
      _isLoading = false;
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        iconTheme: const IconThemeData(color: Color(0xFF5F6368)),
        title: TextField(
          controller: _controller,
          onChanged: _onSearchChanged,
          autofocus: true,
          style: const TextStyle(color: Color(0xFF202124), fontSize: 16),
          decoration: InputDecoration(
            hintText: 'Cari di Malaysia...',
            hintStyle: TextStyle(color: Colors.grey.shade500),
            border: InputBorder.none,
            suffixIcon: _isLoading 
              ? const Padding(
                  padding: EdgeInsets.all(12.0),
                  child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF1A73E8))),
                )
              : _controller.text.isNotEmpty 
                ? IconButton(icon: const Icon(Icons.clear, color: Color(0xFF5F6368)), onPressed: () { _controller.clear(); setState(() => _results = []); })
                : null,
          ),
        ),
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(height: 1, thickness: 1, color: Color(0xFFE8EAED)),
        ),
      ),
      body: _results.isEmpty && !_isLoading
          ? Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                   Icon(Icons.map_outlined, size: 64, color: Colors.grey[200]),
                   const SizedBox(height: 16),
                   Text('Cari lokasi tujuan anda', style: TextStyle(color: Colors.grey[500], fontSize: 14)),
                ],
              ),
            )
          : ListView.separated(
              itemCount: _results.length,
              separatorBuilder: (context, index) => const Padding(
                padding: EdgeInsets.only(left: 68),
                child: Divider(height: 1, thickness: 1, color: Color(0xFFE8EAED)),
              ),
              itemBuilder: (context, index) {
                final item = _results[index];
                return ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                  leading: const CircleAvatar(
                    backgroundColor: Color(0xFFF1F3F4),
                    child: Icon(Icons.location_on, color: Color(0xFF5F6368), size: 22),
                  ),
                  title: Text(item['name'], style: const TextStyle(color: Color(0xFF3C4043), fontWeight: FontWeight.w500, fontSize: 15)),
                  subtitle: Text(item['address'], style: const TextStyle(color: Color(0xFF70757A), fontSize: 13), maxLines: 1, overflow: TextOverflow.ellipsis),
                  onTap: () {
                    widget.onLocationSelected(item['lat'], item['lon'], item['name']);
                  },
                );
              },
            ),
    );
  }
}
