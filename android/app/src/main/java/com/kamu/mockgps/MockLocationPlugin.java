package com.kamu.mockgps;

import android.content.Context;
import android.location.Location;
import android.location.LocationManager;
import android.os.Build;
import android.os.SystemClock;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "MockLocation")
public class MockLocationPlugin extends Plugin {

    @PluginMethod
    public void setMockLocation(PluginCall call) {
        Double latitude = call.getDouble("latitude");
        Double longitude = call.getDouble("longitude");

        if (latitude == null || longitude == null) {
            call.reject("Latitude atau Longitude tidak sah");
            return;
        }

        try {
            Context context = getContext();
            LocationManager locationManager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
            
            // Daftarkan GPS palsu ke dalam sistem teras Android
            String providerName = LocationManager.GPS_PROVIDER;
            try {
                if (locationManager.getProvider(providerName) != null) {
                    locationManager.addTestProvider(providerName, false, false, false, false, true, true, true, 1, 2);
                }
            } catch (SecurityException e) {
                call.reject("Sila aktifkan app ini di Developer Options -> Select mock location app dahulu!");
                return;
            } catch (IllegalArgumentException e) {
                // If it already exists, do nothing
            }
            
            locationManager.setTestProviderEnabled(providerName, true);

            // Set data koordinat baru
            Location mockLocation = new Location(providerName);
            mockLocation.setLatitude(latitude);
            mockLocation.setLongitude(longitude);
            mockLocation.setAltitude(3.0);
            mockLocation.setTime(System.currentTimeMillis());
            mockLocation.setAccuracy(1.0f);
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1) {
                mockLocation.setElapsedRealtimeNanos(SystemClock.elapsedRealtimeNanos());
            }

            locationManager.setTestProviderLocation(providerName, mockLocation);
            
            JSObject ret = new JSObject();
            ret.put("status", "Lokasi berjaya ditukar!");
            call.resolve(ret);

        } catch (Exception e) {
            call.reject("Gagal set mock location: " + e.getMessage());
        }
    }
}
