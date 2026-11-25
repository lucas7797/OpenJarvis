// Compile-time stand-in for the Android 4.2+ annotation (the build's android.jar is API 16).
// Not packaged into the app; the phone's own class is used at run time.
package android.webkit;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.METHOD})
public @interface JavascriptInterface {}
