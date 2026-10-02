# BMZ AI

BMZ AI هي بيئة تطوير تعتمد على GitHub كمصدر للكود والتخزين والبناء، وليست خدمة Expo EAS.

## ما تنفذه المنظومة

- إنشاء مساحة مشروع حقيقية.
- استيراد مستودع GitHub إلى مساحة العمل.
- شجرة ملفات وقراءة وتحرير الملفات.
- وكيل يضع خطة ثم ينفذ الإجراءات داخل Sandbox.
- دورة اختبار وإصلاح عند فشل العملية.
- إنشاء مشروع Android Native مبني بـ Gradle.
- بناء APK عبر GitHub Actions وAndroid SDK.
- حفظ APK كـGitHub Actions artifact.
- إرسال التغييرات إلى GitHub بعد موافقة صريحة.
- تشغيل بناء Android تلقائيًا بعد Commit المشروع.
- معاينة HTML للمشاريع التي تحتوي على index.html.
- سجل تنفيذ وذاكرة للمشروع.
- لا يوجد اعتماد على حساب Expo أو Expo EAS أو EXPO_TOKEN.

## المكونات

- `mobile/`: واجهة BMZ AI على الهاتف، وتحتوي على ملفات/محرر/معاينة/سجل الوكيل.
- `backend/`: المنسق والوكيل وSandbox وGitHub integration.
- `shared/`: العقود المشتركة.
- `templates/android/`: قالب Android Native يستخدم Android SDK وGradle.
- `.github/workflows/`: CI وبناء Android.

## التشغيل

Backend على المنفذ 4000.

يتطلب التكامل مع GitHub عند الحاجة إلى Commit فعلي متغير بيئة `GITHUB_TOKEN` بصلاحيات مناسبة. كما يحتاج مكوّن الاستدلال إلى `OPENAI_API_KEY` و`OPENAI_MODEL` إذا أريد استخدام نموذج الاستدلال الخارجي.

العمليات الحساسة، ومنها Commit إلى GitHub، تتطلب موافقة صريحة.
