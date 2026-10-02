import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createSandboxWorkspace } from './sandbox-core.js';

const files: Record<string, string> = {
  'settings.gradle': Buffer.from('cGx1Z2luTWFuYWdlbWVudCB7IHJlcG9zaXRvcmllcyB7IGdvb2dsZSgpOyBtYXZlbkNlbnRyYWwoKTsgZ3JhZGxlUGx1Z2luUG9ydGFsKCkgfSB9CmRlZmVwbmRlbmN5UmVzb2x1dGlvbk1hbmFnZW1lbnQgeyByZXBvc2l0b3JpZXNNb2RlID1SZXBvc2l0b3JpZXNNb2RlLkZBSUxfT05fUFJPSkVDVDsgcmVwb3NpdG9yaWVzIHsgZ29vZ2xlKCk7IG1hdmVuQ2VudHJhbCgpIH0gfQpyb290UHJvamVjdC5uYW1lID0gJ0JNWkdlbmVyYXRlZEFwcCcKaW5jbHVkZSAnOmFwcCcK','base64').toString('utf8'),
  'build.gradle': Buffer.from('YnVpbGRzY3JpcHQgeyByZXBvc2l0b3JpZXMgeyBnb29nbGUoKTsgbWF2ZW5DZW50cmFsKCkgfSBkZXBlbmRlbmNpZXMgeyBjbGFzc3BhdGggJ2NvbS5hbmRyb2lkLnRvb2xzLmJ1aWxkOmdyYWRsZTo4LjcuMycgfSB9CmFsbHByb2plY3RzIHsgcmVwb3NpdG9yaWVzIHsgZ29vZ2xlKCk7IG1hdmVuQ2VudHJhbCgpIH0gfQ==','base64').toString('utf8'),
  'gradle.properties': 'org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8\nandroid.useAndroidX=true\n',
  'app/build.gradle': Buffer.from('YXBwbHkgcGx1Z2luOiAnY29tLmFuZHJvaWQuYXBwbGljYXRpb24nCmFuZHJvaWQgeyBuYW1lc3BhY2UgJ2NvbS5ibXouZ2VuZXJhdGVkJzsgY29tcGlsZVNkayAzNTsgZGVmYXVsdENvbmZpZyB7IGFwcGxpY2F0aW9uSWQgJ2NvbS5ibXouZ2VuZXJhdGVkJzsgbWluU2RrIDIzOyB0YXJnZXRTZGsgMzU7IHZlcnNpb25Db2RlIDE7IHZlcnNpb25OYW1lICcxLjAnIH0gfQo=','base64').toString('utf8'),
  'app/src/main/AndroidManifest.xml': '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:theme="@style/AppTheme" android:label="BMZ AI App"><activity android:name=".MainActivity" android:exported="true"><intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter></activity></application></manifest>',
  'app/src/main/java/com/bmz/generated/MainActivity.kt': 'package com.bmz.generated\n\nimport android.app.Activity\nimport android.os.Bundle\nimport android.widget.TextView\n\nclass MainActivity : Activity() { override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); val view = TextView(this); view.text = "BMZ AI — تطبيق Android مولّد"; view.textSize = 22f; view.setPadding(48,48,48,48); setContentView(view) } }',
  'app/src/main/res/values/styles.xml': '<resources><style name="AppTheme" parent="android:style/Theme.Material.Light.NoActionBar"/></resources>',
};

export async function scaffoldAndroidApp(projectId?: string) {
  const workspace = await createSandboxWorkspace(projectId);
  for (const [relative, content] of Object.entries(files)) {
    const target = path.resolve(workspace.directory, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf8');
  }
  return { workspaceId: workspace.id, files: Object.keys(files) };
}
