import express from 'express';

type AgentRequest = {
  message?: unknown;
  projectId?: unknown;
};

type PlanStep = {
  id: string;
  title: string;
  status: 'pending';
};

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({
    success: true,
    service: 'BMZ AI Backend',
    status: 'ready',
  });
});

app.post('/api/agent', (req, res) => {
  const body = req.body as AgentRequest;
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (!message) {
    res.status(400).json({
      success: false,
      error: 'message is required',
    });
    return;
  }

  const steps: PlanStep[] = [
    { id: 'understand', title: 'فهم المهمة والمتطلبات', status: 'pending' },
    { id: 'plan', title: 'إعداد خطة تنفيذ قابلة للتحقق', status: 'pending' },
    { id: 'execute', title: 'تنفيذ العمليات المسموح بها داخل بيئة آمنة', status: 'pending' },
    { id: 'test', title: 'اختبار النتيجة ومعالجة الأخطاء', status: 'pending' },
  ];

  res.json({
    success: true,
    projectId: typeof body.projectId === 'string' ? body.projectId : null,
    message,
    plan: {
      goal: message,
      steps,
    },
    execution: {
      status: 'awaiting_execution',
      message: 'تم استلام المهمة وإعداد الخطة. التنفيذ الفعلي سيستخدم طبقة الصلاحيات وبيئة Sandbox.',
    },
  });
});

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`BMZ AI Backend running on http://0.0.0.0:${PORT}`);
});
