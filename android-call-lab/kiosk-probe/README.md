# Kiosk Probe (Android 5.1+)

Separate diagnostic APK, not the Call Lab network app. No network, media,
password reset, lockscreen dismissal, or boot-time kiosk entry.

**Warning:** Android 5.1 managed lock task may disable the normal keyguard
while active. This is a different security model, not an overlay over a
secure keyguard. Use only a dedicated test device with authorized USB ADB.
Device owner provisioning may be rejected on already provisioned devices,
with accounts, additional users, or OEM policy restrictions. Do not erase
data, remove accounts, or change passwords just to make this test pass.

Install the CI artifact, verify SHA256, then:
```sh
adb install kiosk-probe.apk
adb shell dpm set-device-owner io.github.calllab.kiosk/.AdminReceiver
adb shell am start -n io.github.calllab.kiosk/.KioskActivity
```

If owner provisioning succeeds, unlock the device normally and press
"Enter managed kiosk test". Verify Home/Recents behavior, sleep/wake,
and the displayed lock-task state. A denied owner command is a valid
test outcome. Do not confuse ordinary screen pinning with managed lock task.

Recovery (authorized shell, no network receiver):
```sh
adb shell am broadcast -n io.github.calllab.kiosk/.RecoveryReceiver -a io.github.calllab.kiosk.EXIT
adb shell am broadcast -n io.github.calllab.kiosk/.RecoveryReceiver -a io.github.calllab.kiosk.RELEASE
adb shell dumpsys device_policy
adb uninstall io.github.calllab.kiosk
```

Verify release before uninstalling or replacing the APK. CI keys are ephemeral;
never remove a device-owner app without first removing its owner policy.
The test does not implement an admin PIN, production kiosk, or a call.
