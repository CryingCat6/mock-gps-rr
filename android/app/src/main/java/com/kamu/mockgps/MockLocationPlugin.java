package com.kamu.mockgps;

import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.BroadcastReceiver;
import android.location.Location;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import android.Manifest;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(name = "MockLocation", permissions = {
    @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
    @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
})
public class MockLocationPlugin extends Plugin {

    private Handler handler = new Handler(Looper.getMainLooper());
    private Runnable mockLocationRunnable;
    private Double currentLatitude;
    private Double currentLongitude;
    private BroadcastReceiver stopReceiver;

    @Override
    public void load() {
        super.load();
        stopReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if ("com.kamu.mockgps.STOP_MOCKING".equals(intent.getAction())) {
                    stopMockingInternally();
                    
                    Intent serviceIntent = new Intent(getContext(), MockLocationService.class);
                    getContext().stopService(serviceIntent);
                    
                    JSObject ret = new JSObject();
                    ret.put("stoppedByNotification", true);
                    notifyListeners("onMockStopped", ret);
                }
            }
        };
        
        IntentFilter filter = new IntentFilter("com.kamu.mockgps.STOP_MOCKING");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(stopReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(stopReceiver, filter);
        }
    }

    @PluginMethod
    public void requestAppPermissions(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED || 
            (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && getPermissionState("notifications") != PermissionState.GRANTED)) {
            requestAllPermissions(call, "permissionsCallback");
        } else {
            call.resolve();
        }
    }

    @PermissionCallback
    private void permissionsCallback(PluginCall call) {
        call.resolve();
    }

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
            
            // Start Foreground Service to keep app alive
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent serviceIntent = new Intent(context, MockLocationService.class);
                serviceIntent.setAction("START");
                serviceIntent.putExtra("title", "mock GPS rr");
                serviceIntent.putExtra("text", "Running...");
                context.startForegroundService(serviceIntent);
            } else {
                Intent serviceIntent = new Intent(context, MockLocationService.class);
                serviceIntent.setAction("START");
                context.startService(serviceIntent);
            }
            LocationManager locationManager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
            
            String[] providers = {
                LocationManager.GPS_PROVIDER, 
                LocationManager.NETWORK_PROVIDER, 
                LocationManager.PASSIVE_PROVIDER,
                "fused"
            };
            
            try {
                try {
                   locationManager.addTestProvider(LocationManager.GPS_PROVIDER, false, true, false, false, true, true, true, 1, 1);
                } catch (IllegalArgumentException e) {
                   locationManager.removeTestProvider(LocationManager.GPS_PROVIDER);
                   locationManager.addTestProvider(LocationManager.GPS_PROVIDER, false, true, false, false, true, true, true, 1, 1);
                }
                locationManager.setTestProviderEnabled(LocationManager.GPS_PROVIDER, true);
            } catch (SecurityException e) {
                call.reject("Sila aktifkan app ini di Developer Options -> Select mock location app dahulu!");
                return;
            } catch (Exception e) {}

            try {
                try {
                   locationManager.addTestProvider(LocationManager.NETWORK_PROVIDER, true, false, true, false, false, false, false, 1, 2);
                } catch (IllegalArgumentException e) {
                   locationManager.removeTestProvider(LocationManager.NETWORK_PROVIDER);
                   locationManager.addTestProvider(LocationManager.NETWORK_PROVIDER, true, false, true, false, false, false, false, 1, 2);
                }
                locationManager.setTestProviderEnabled(LocationManager.NETWORK_PROVIDER, true);
            } catch (Exception e) {}
            
            try {
                try {
                   locationManager.addTestProvider(LocationManager.PASSIVE_PROVIDER, false, false, false, false, false, false, false, 1, 2);
                } catch (IllegalArgumentException e) {
                   locationManager.removeTestProvider(LocationManager.PASSIVE_PROVIDER);
                   locationManager.addTestProvider(LocationManager.PASSIVE_PROVIDER, false, false, false, false, false, false, false, 1, 2);
                }
                locationManager.setTestProviderEnabled(LocationManager.PASSIVE_PROVIDER, true);
            } catch (Exception e) {}

            try {
                try {
                   locationManager.addTestProvider("fused", false, false, false, false, true, true, true, 1, 1);
                } catch (IllegalArgumentException e) {
                   locationManager.removeTestProvider("fused");
                   locationManager.addTestProvider("fused", false, false, false, false, true, true, true, 1, 1);
                }
                locationManager.setTestProviderEnabled("fused", true);
            } catch (Exception e) {}

            // Push immediately
            for (String providerName : providers) {
                try {
                    Location mockLocation = new Location(providerName);
                    mockLocation.setLatitude(currentLatitude);
                    mockLocation.setLongitude(currentLongitude);
                    mockLocation.setAltitude(3.0);
                    mockLocation.setSpeed(0.0f);
                    mockLocation.setBearing(0.0f);
                    mockLocation.setAccuracy(1.0f);
                    mockLocation.setTime(System.currentTimeMillis());
                    
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1) {
                        mockLocation.setElapsedRealtimeNanos(SystemClock.elapsedRealtimeNanos());
                    }
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        mockLocation.setBearingAccuracyDegrees(0.1f);
                        mockLocation.setVerticalAccuracyMeters(0.1f);
                        mockLocation.setSpeedAccuracyMetersPerSecond(0.01f);
                    }

                    // Try to push it to the system
                    locationManager.setTestProviderLocation(providerName, mockLocation);
                } catch (Exception e) {
                    // Ignore
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
                                    mockLocation.setSpeed(0.0f);
                                    mockLocation.setBearing(0.0f);
                                    mockLocation.setAccuracy(1.0f);
                                    mockLocation.setTime(System.currentTimeMillis());
                                    
                                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1) {
                                        mockLocation.setElapsedRealtimeNanos(SystemClock.elapsedRealtimeNanos());
                                    }
                                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                                        mockLocation.setBearingAccuracyDegrees(0.1f);
                                        mockLocation.setVerticalAccuracyMeters(0.1f);
                                        mockLocation.setSpeedAccuracyMetersPerSecond(0.01f);
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
        
        Intent serviceIntent = new Intent(getContext(), MockLocationService.class);
        getContext().stopService(serviceIntent);

        JSObject ret = new JSObject();
        ret.put("status", "Mock location dihentikan");
        call.resolve(ret);
    }

    @PluginMethod
    public void updateNotification(PluginCall call) {
        String title = call.getString("title", "Mock GPS rr");
        String text = call.getString("text", "Running...");
        
        Intent serviceIntent = new Intent(getContext(), MockLocationService.class);
        serviceIntent.setAction("UPDATE");
        serviceIntent.putExtra("title", title);
        serviceIntent.putExtra("text", text);
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(serviceIntent);
        } else {
            getContext().startService(serviceIntent);
        }
        
        call.resolve();
    }

    @PluginMethod
    public void finishNotification(PluginCall call) {
        String title = call.getString("title", "mock GPS rr");
        String text = call.getString("text", "You have reached your destination.");
        
        Intent serviceIntent = new Intent(getContext(), MockLocationService.class);
        serviceIntent.setAction("FINISH_NOTIFICATION");
        serviceIntent.putExtra("title", title);
        serviceIntent.putExtra("text", text);
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(serviceIntent);
        } else {
            getContext().startService(serviceIntent);
        }
        
        call.resolve();
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
                    // Important: Clear the last known location and disable the test provider before removing it
                    locationManager.clearTestProviderLocation(providerName);
                } catch (Exception e) {}
                try {
                    locationManager.clearTestProviderEnabled(providerName);
                } catch (Exception e) {}
                try {
                    locationManager.setTestProviderEnabled(providerName, false);
                } catch (Exception e) {}
                try {
                    locationManager.removeTestProvider(providerName);
                } catch (Exception e) {}
            }
        } catch (Exception e) {
            // Context/System service fails
        }

        currentLatitude = null;
        currentLongitude = null;
    }

    @PluginMethod
    public void openDeveloperOptions(PluginCall call) {
        try {
            android.content.Intent intent = new android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS);
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            // Intent not found (developer options not enabled), fallback to general settings
            try {
                android.content.Intent intent = new android.content.Intent(android.provider.Settings.ACTION_SETTINGS);
                intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().startActivity(intent);
                call.resolve();
            } catch (Exception e2) {
                call.reject("Could not open settings", e2);
            }
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (stopReceiver != null) {
            try {
                getContext().unregisterReceiver(stopReceiver);
            } catch (Exception e) {}
        }
        stopMockingInternally();
        super.handleOnDestroy();
    }
}

