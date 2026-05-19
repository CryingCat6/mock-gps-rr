package com.kamu.mockgps;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;

public class MockLocationService extends Service {
    private static final String CHANNEL_ID = "mock_gps_channel";
    private static final int NOTIFICATION_ID = 199;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent.getAction();
        if ("START".equals(action) || "UPDATE".equals(action)) {
            String title = intent.getStringExtra("title");
            String text = intent.getStringExtra("text");
            if (title == null) title = "Mock GPS rr";
            if (text == null) text = "Running...";

            Intent notificationIntent = new Intent(this, MainActivity.class);
            notificationIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pendingIntent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                pendingIntent = PendingIntent.getActivity(this, 0, notificationIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            } else {
                pendingIntent = PendingIntent.getActivity(this, 0, notificationIntent, PendingIntent.FLAG_UPDATE_CURRENT);
            }

            Intent stopIntent = new Intent(this, MockLocationService.class);
            stopIntent.setAction("STOP");
            PendingIntent stopPendingIntent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                stopPendingIntent = PendingIntent.getService(this, 1, stopIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            } else {
                stopPendingIntent = PendingIntent.getService(this, 1, stopIntent, PendingIntent.FLAG_UPDATE_CURRENT);
            }

            NotificationCompat.Action stopAction = new NotificationCompat.Action.Builder(
                android.R.drawable.ic_menu_close_clear_cancel, "X STOP", stopPendingIntent
            ).build();

            Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                    .setContentTitle(title)
                    .setContentText(text)
                    .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                    .setContentIntent(pendingIntent)
                    .addAction(stopAction)
                    .setOngoing(true)
                    .setPriority(NotificationCompat.PRIORITY_LOW)
                    .build();

            startForeground(NOTIFICATION_ID, notification);
            
            // Broadcast intent to JS
            if ("UPDATE".equals(action)) {
                NotificationManager manager = getSystemService(NotificationManager.class);
                if (manager != null) manager.notify(NOTIFICATION_ID, notification);
            }

        } else if ("STOP".equals(action)) {
            // Tell the React app to stop
            Intent stopBroadcast = new Intent("com.kamu.mockgps.STOP_MOCKING");
            sendBroadcast(stopBroadcast);
            
            stopForeground(true);
            stopSelf();
        } else if ("FINISH_NOTIFICATION".equals(action)) {
            String title = intent.getStringExtra("title");
            String text = intent.getStringExtra("text");
            if (title == null) title = "Mock GPS rr";
            if (text == null) text = "You have reached your destination.";

            Intent notificationIntent = new Intent(this, MainActivity.class);
            notificationIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pendingIntent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                pendingIntent = PendingIntent.getActivity(this, 0, notificationIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            } else {
                pendingIntent = PendingIntent.getActivity(this, 0, notificationIntent, PendingIntent.FLAG_UPDATE_CURRENT);
            }
            
            Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                    .setContentTitle(title)
                    .setContentText(text)
                    .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                    .setContentIntent(pendingIntent)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .build();
            
            stopForeground(true);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.notify(200, notification);
            stopSelf();
        }
        
        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel serviceChannel = new NotificationChannel(
                    CHANNEL_ID,
                    "Mock GPS Notifications",
                    NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(serviceChannel);
            }
        }
    }
}
