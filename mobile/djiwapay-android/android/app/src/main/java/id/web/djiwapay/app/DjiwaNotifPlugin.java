package id.web.djiwapay.app;

import android.content.ComponentName;
import android.content.Intent;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;

/** The bridge between the notification reader and the web app: which apps to read, is access on, hand over what was read. */
@CapacitorPlugin(name = "DjiwaNotif")
public class DjiwaNotifPlugin extends Plugin {
    @PluginMethod
    public void configure(PluginCall call) {
        JSArray apps = call.getArray("packages");
        NotifStore.setApps(getContext(), apps == null ? new JSONArray() : apps);
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("enabled", NotificationManagerCompat.getEnabledListenerPackages(getContext()).contains(getContext().getPackageName()));
        r.put("pending", NotifStore.pending(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        // Some phone makers do not ship the standard screen; try the others so the button never does nothing.
        String pkg = getContext().getPackageName();
        Intent[] tries = new Intent[] {
            new Intent("android.settings.NOTIFICATION_LISTENER_SETTINGS"),
            new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS")
                .putExtra("android.provider.extra.NOTIFICATION_LISTENER_COMPONENT_NAME", new ComponentName(pkg, DjiwaNotifService.class.getName()).flattenToString()),
            new Intent("android.settings.APPLICATION_DETAILS_SETTINGS").setData(android.net.Uri.parse("package:" + pkg)),
            new Intent(Settings.ACTION_SETTINGS)
        };
        for (Intent i : tries) {
            try {
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                JSObject r = new JSObject();
                r.put("screen", i.getAction());
                call.resolve(r);
                return;
            } catch (Exception ignored) { }
        }
        call.reject("Pengaturan akses notifikasi tidak bisa dibuka");
    }

    @PluginMethod
    public void peek(PluginCall call) {
        JSObject r = new JSObject();
        r.put("items", NotifStore.peek(getContext(), Math.max(1, Math.min(40, call.getInt("max", 40)))));
        call.resolve(r);
    }

    @PluginMethod
    public void ack(PluginCall call) {
        NotifStore.ack(getContext(), Math.max(0, call.getInt("count", 0)));
        call.resolve();
    }
}
