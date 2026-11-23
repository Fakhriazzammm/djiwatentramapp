package id.web.djiwapay.app;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.HashSet;
import java.util.Set;

/** Notifications waiting to be handed to the app, and the list of apps allowed to be read. Stays on the phone until the app has sent and acknowledged them. */
final class NotifStore {
    private static final String FILE = "djiwa_notif", QUEUE = "queue", APPS = "apps";
    private static final int MAX = 300;
    private static final Object LOCK = new Object();
    private NotifStore() {}

    private static SharedPreferences prefs(Context c) { return c.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE); }

    static void setApps(Context c, JSONArray packages) {
        Set<String> set = new HashSet<>();
        for (int i = 0; i < packages.length() && i < 500; i++) { String p = packages.optString(i, ""); if (!p.isEmpty()) set.add(p); }
        prefs(c).edit().putStringSet(APPS, set).apply();
    }

    static boolean allowed(Context c, String pkg) { return prefs(c).getStringSet(APPS, new HashSet<>()).contains(pkg); }

    static void add(Context c, JSONObject item) {
        synchronized (LOCK) {
            try {
                JSONArray q = new JSONArray(prefs(c).getString(QUEUE, "[]"));
                String key = item.optString("key");
                for (int i = 0; i < q.length(); i++) if (key.equals(q.getJSONObject(i).optString("key"))) return;   // the same notification posted twice
                q.put(item);
                if (q.length() > MAX) { JSONArray cut = new JSONArray(); for (int i = q.length() - MAX; i < q.length(); i++) cut.put(q.get(i)); q = cut; }
                prefs(c).edit().putString(QUEUE, q.toString()).apply();
            } catch (Exception ignored) { }
        }
    }

    static JSONArray peek(Context c, int max) {
        synchronized (LOCK) {
            JSONArray out = new JSONArray();
            try { JSONArray q = new JSONArray(prefs(c).getString(QUEUE, "[]")); for (int i = 0; i < q.length() && i < max; i++) out.put(q.get(i)); } catch (Exception ignored) { }
            return out;
        }
    }

    static void ack(Context c, int count) {
        synchronized (LOCK) {
            try {
                JSONArray q = new JSONArray(prefs(c).getString(QUEUE, "[]")), rest = new JSONArray();
                for (int i = count; i < q.length(); i++) rest.put(q.get(i));
                prefs(c).edit().putString(QUEUE, rest.toString()).apply();
            } catch (Exception ignored) { }
        }
    }

    static int pending(Context c) { synchronized (LOCK) { try { return new JSONArray(prefs(c).getString(QUEUE, "[]")).length(); } catch (Exception e) { return 0; } } }
}
