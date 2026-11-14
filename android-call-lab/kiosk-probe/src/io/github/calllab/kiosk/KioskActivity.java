package io.github.calllab.kiosk;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.KeyguardManager;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.util.Log;
import java.lang.ref.WeakReference;

public final class KioskActivity extends Activity {
    static final String TAG="KioskProbe";
    private static WeakReference<KioskActivity> instance=new WeakReference<>(null);
    private TextView info;
    private Button enter;
    static ComponentName admin(Context c){return new ComponentName(c,AdminReceiver.class);}
    static DevicePolicyManager policy(Context c){return (DevicePolicyManager)c.getSystemService(Context.DEVICE_POLICY_SERVICE);}
    static boolean lockedTask(Context c){return ((ActivityManager)c.getSystemService(Context.ACTIVITY_SERVICE)).isInLockTaskMode();}
    @Override public void onCreate(Bundle b){
        super.onCreate(b);
        instance=new WeakReference<>(this);
        LinearLayout root=new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(24,24,24,24);
        info=new TextView(this);
        info.setTextSize(20);
        root.addView(info);
        enter=new Button(this);
        enter.setText("Enter managed kiosk test");
        enter.setOnClickListener(v -> enterKiosk());
        root.addView(enter,new LinearLayout.LayoutParams(-1,-2));
        Button refresh=new Button(this);
        refresh.setText("Refresh status");
        refresh.setOnClickListener(v -> refresh());
        root.addView(refresh);
        setContentView(root);
    }
    @Override protected void onResume(){super.onResume();refresh();}
    private void refresh(){
        boolean owner=policy(this).isDeviceOwnerApp(getPackageName());
        boolean task=lockedTask(this);
        boolean allowed=policy(this).isLockTaskPermitted(getPackageName());
        boolean locked=((KeyguardManager)getSystemService(KEYGUARD_SERVICE)).isDeviceLocked();
        info.setText("Call Lab Kiosk Probe\n\nDevice owner: "+owner+"\nLock task permitted: "+allowed+"\nIn lock task: "+task+"\nDevice locked: "+locked+"\n\nNo PIN changes. No camera or network.\nExit using authorized ADB recovery.");
        enter.setEnabled(owner&&!task&&!locked);
        Log.i(TAG,"owner="+owner+" allowed="+allowed+" task="+task+" locked="+locked);
    }
    private void enterKiosk(){
        DevicePolicyManager d=policy(this);
        if(!d.isDeviceOwnerApp(getPackageName())||((KeyguardManager)getSystemService(KEYGUARD_SERVICE)).isDeviceLocked())return;
        try{
            d.setLockTaskPackages(admin(this),new String[]{getPackageName()});
            if(!d.isLockTaskPermitted(getPackageName()))throw new IllegalStateException("Not allowlisted");
            startLockTask();
            Log.i(TAG,"managed lock task entered");
            refresh();
        }catch(RuntimeException e){Log.e(TAG,"enter failed",e);refresh();}
    }
    static void recover(Context c,boolean release){
        DevicePolicyManager d=policy(c);
        if(!d.isDeviceOwnerApp(c.getPackageName())){Log.i(TAG,"not device owner");return;}
        KioskActivity activity=instance.get();
        if(lockedTask(c)){
            if(activity==null){Log.e(TAG,"Open probe Activity before recovery");return;}
            activity.stopLockTask();
        }
        d.setLockTaskPackages(admin(c),new String[0]);
        if(release){
            d.clearDeviceOwnerApp(c.getPackageName());
            if(d.isAdminActive(admin(c)))d.removeActiveAdmin(admin(c));
        }
        Log.i(TAG,"recovery completed release="+release);
        if(activity!=null)activity.refresh();
    }
}
