package id.web.djiwapay.app;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import org.json.JSONObject;

/**
 * Reads notifications of the bank, e-wallet and biller apps the person allowed, and nothing else: any other app's notification
 * is dropped before its text is even looked at. The text is kept on the phone until Djiwa Pay sends it to the person's own account.
 */
public class DjiwaNotifService extends NotificationListenerService {
    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            String pkg = sbn.getPackageName();
            if (pkg == null || !NotifStore.allowed(this, pkg)) return;
            Notification n = sbn.getNotification();
            if (n == null || (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
            Bundle x = n.extras;
            if (x == null) return;
            CharSequence title = x.getCharSequence(Notification.EXTRA_TITLE), big = x.getCharSequence(Notification.EXTRA_BIG_TEXT), text = x.getCharSequence(Notification.EXTRA_TEXT);
            String body = big != null && big.length() > 0 ? big.toString() : text != null ? text.toString() : "";
            String head = title != null ? title.toString() : "";
            if (head.isEmpty() && body.isEmpty()) return;
            JSONObject o = new JSONObject();
            o.put("pkg", pkg); o.put("title", head); o.put("text", body); o.put("at", sbn.getPostTime()); o.put("key", sbn.getKey() + ":" + sbn.getPostTime());
            NotifStore.add(this, o);
        } catch (Exception ignored) { }
    }
}
