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
        Intent i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
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
