package com.palsu.gps

import android.content.Context
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.SystemClock
import androidx.annotation.NonNull
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity: FlutterActivity() {
    private val CHANNEL = "com.palsu.gps/mock"
    private lateinit var locationManager: LocationManager

    override fun configureFlutterEngine(@NonNull flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            if (call.method == "hantarKoordinatKeAndroid") {
                val lat = call.argument<Double>("lat")
                val lng = call.argument<Double>("lng")
                if (lat != null && lng != null) {
                    try {
                        injectMockLocation(lat, lng)
                        result.success(true)
                    } catch (e: SecurityException) {
                        result.error("PERMISSION_DENIED", "SecurityException: Mock Location not enabled in Developer Options", e.message)
                    } catch (e: Exception) {
                        result.error("ERROR", e.message, null)
                    }
                } else {
                    result.error("INVALID_ARGS", "Missing lat or lng", null)
                }
            } else {
                result.notImplemented()
            }
        }
    }

    private fun injectMockLocation(lat: Double, lng: Double) {
        val providerName = LocationManager.GPS_PROVIDER
        
        // Prepare local provider if not already there (System might handle this if app is selected as Mock App)
        try {
            locationManager.addTestProvider(
                providerName,
                false, false, false, false, true, true, true,
                android.location.Criteria.POWER_LOW,
                android.location.Criteria.ACCURACY_FINE
            )
        } catch (e: Exception) {
            // Provider might already exist or handled by system
        }

        locationManager.setTestProviderEnabled(providerName, true)

        val mockLocation = Location(providerName)
        mockLocation.latitude = lat
        mockLocation.longitude = lng
        mockLocation.altitude = 0.0
        mockLocation.time = System.currentTimeMillis()
        mockLocation.speed = 25.0f // Simulator speed in m/s (~90km/h)
        mockLocation.bearing = 0.0f
        mockLocation.accuracy = 1.0f

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1) {
            mockLocation.elapsedRealtimeNanos = SystemClock.elapsedRealtimeNanos()
        }

        locationManager.setTestProviderLocation(providerName, mockLocation)
    }
}
