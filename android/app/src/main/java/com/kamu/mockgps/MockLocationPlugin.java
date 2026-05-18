package com.kamu.mockgps;

import android.content.Context;
import android.location.Location;
import android.location.LocationManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "MockLocation")
public class MockLocationPlugin extends Plugin {

    private Handler handler = new Handler(Looper.getMainLooper());
    private Runnable mockLocationRunnable;
    private Double currentLatitude;
    private Double currentLongitude;

    @PluginMethod
    public void setMockLocation(PluginCall call) {
        Double latitude = call.getDouble("latitude");
        Double longitude = call.getDouble("longitude");

        if (latitude == null || longitude == null) {
            call.reject("Latitude atau Longitude tidak sah");
            return;
        }

        currentLatitude = latitude;
        currentLongitude = longitude;

        try {
            Context context = getContext();
            LocationManager locationManager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
            
            String[] providers = {
                LocationManager.GPS_PROVIDER, 
                LocationManager.NETWORK_PROVIDER, 
                LocationManager.PASSIVE_PROVIDER,
                "fused"
            };
            
            for (String providerName : providers) {
                try {
                    if (locationManager.getProvider(providerName) != null) {
                        try {
                            locationManager.addTestProvider(providerName, false, false, false, false, true, true, true, 1, 2);
                        } catch (IllegalArgumentException e) {
                            // If it exists, we might need to remove and re-add to be sure
                            try {
                                locationManager.removeTestProvider(providerName);
                                locationManager.addTestProvider(providerName, false, false, false, false, true, true, true, 1, 2);
                            } catch (Exception ex) {
                                // Ignore
                            }
                        }
                        locationManager.setTestProviderEnabled(providerName, true);
                    }
                } catch (SecurityException e) {
                    call.reject("Sila aktifkan app ini di Developer Options -> Select mock location app dahulu!");
                    return;
                } catch (Exception e) {
                    // Ignore other errors for specific providers
                }
            }

            if (mockLocationRunnable == null) {
                mockLocationRunnable = new Runnable() {
                    @Override
                    public void run() {
                        if (currentLatitude != null && currentLongitude != null) {
                            for (String providerName : providers) {
                                try {
                                    Location mockLocation = new Location(providerName);
                                    mockLocation.setLatitude(currentLatitude);
                                    mockLocation.setLongitude(currentLongitude);
                                    mockLocation.setAltitude(3.0);
                                    mockLocation.setSpeed(0.01f);
                                    mockLocation.setBearing(1.0f);
                                    mockLocation.setAccuracy(1.0f);
                                    mockLocation.setTime(System.currentTimeMillis());
                                    
                                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1) {
                                        mockLocation.setElapsedRealtimeNanos(SystemClock.elapsedRealtimeNanos());
                                    }
                                    
                                    // Try to push it to the system
                                    locationManager.setTestProviderLocation(providerName, mockLocation);
                                } catch (Exception e) {
                                    // Ignore
                                }
                            }
                        }
                        handler.postDelayed(this, 1000); // Repeat every 1 second
                    }
                };
                handler.post(mockLocationRunnable);
            }
            
            JSObject ret = new JSObject();
            ret.put("status", "Lokasi berjaya ditukar!");
            call.resolve(ret);

        } catch (Exception e) {
            call.reject("Gagal set mock location: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopMockLocation(PluginCall call) {
        stopMockingInternally();
        JSObject ret = new JSObject();
        ret.put("status", "Mock location dihentikan");
        call.resolve(ret);
    }

    private void stopMockingInternally() {
        if (mockLocationRunnable != null) {
            handler.removeCallbacks(mockLocationRunnable);
            mockLocationRunnable = null;
        }

        try {
            Context context = getContext();
            LocationManager locationManager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
            
            String[] providers = {
                LocationManager.GPS_PROVIDER, 
                LocationManager.NETWORK_PROVIDER, 
                LocationManager.PASSIVE_PROVIDER,
                "fused"
            };
            
            for (String providerName : providers) {
                try {
                    // Try to clear everything
                    locationManager.setTestProviderEnabled(providerName, false);
                    locationManager.removeTestProvider(providerName);
                } catch (Exception e) {
                    // Ignore if not found or cannot be removed
                }
            }
        } catch (Exception e) {
            // Context/System service fails
        }

        currentLatitude = null;
        currentLongitude = null;
    }

    @Override
    protected void handleOnDestroy() {
        stopMockingInternally();
        super.handleOnDestroy();
    }
}

