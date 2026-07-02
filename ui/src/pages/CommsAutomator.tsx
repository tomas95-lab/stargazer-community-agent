import { useState, useEffect } from 'react';
import { api, type CommsTemplate } from '../api';
import CommsForm from '../components/CommsForm';

const CATEGORIES = [
  { id: 'urgent_alert', label: 'Urgent Alert' },
  { id: 'webinar_alignment', label: 'Webinar / Alignment' },
  { id: 'war_room', label: 'War Room' },
  { id: 'throttle_quality', label: 'Throttle / Quality' },
  { id: 'reviewer_qma_allocation', label: 'Reviewer / QMA' },
  { id: 'onboarding', label: 'Onboarding' },
  { id: 'access_cursor_setup', label: 'Access / Cursor' },
  { id: 'quality_feedback_escalation', label: 'Quality Feedback' },
  { id: 'daily_thread_announcement', label: 'Daily Announcement' },
  { id: 'custom', label: 'Custom Message' },
];

const CATEGORY_ICONS: Record<string, string> = {
  urgent_alert: '🚨',
  webinar_alignment: '📡',
  war_room: '🎙️',
  throttle_quality: '⚙️',
  reviewer_qma_allocation: '👥',
  onboarding: '🎉',
  access_cursor_setup: '🔑',
  quality_feedback_escalation: '📋',
  daily_thread_announcement: '🧵',
  custom: '✏️',
};

export default function CommsAutomator() {
  const [activeCategory, setActiveCategory] = useState('urgent_alert');
  const [templates, setTemplates] = useState<CommsTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<CommsTemplate | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setSelectedTemplate(null);
    api.getCommsTemplates(activeCategory).then((t) => {
      setTemplates(t);
      setLoading(false);
    });
  }, [activeCategory]);

  return (
    <div className="flex gap-6 min-h-[600px]">
      <aside className="w-52 shrink-0">
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => { setActiveCategory(cat.id); setSelectedTemplate(null); }}
              className={`w-full text-left px-4 py-3 text-sm transition-colors flex items-center gap-2 border-b border-gray-800 last:border-0 ${
                activeCategory === cat.id
                  ? 'bg-indigo-600 text-white font-semibold'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <span>{CATEGORY_ICONS[cat.id]}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        {selectedTemplate ? (
          <CommsForm
            template={selectedTemplate}
            onBack={() => setSelectedTemplate(null)}
          />
        ) : (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white">
              {CATEGORY_ICONS[activeCategory]} {CATEGORIES.find((c) => c.id === activeCategory)?.label}
            </h2>

            {loading ? (
              <p className="text-gray-500">Loading...</p>
            ) : templates.length === 0 ? (
              <p className="text-gray-500">No templates in this category.</p>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTemplate(t)}
                    className="text-left bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-indigo-500 hover:bg-gray-800/60 transition-all group"
                  >
                    <h3 className="font-semibold text-white group-hover:text-indigo-300 transition-colors mb-1">
                      {t.name}
                    </h3>
                    <p className="text-gray-500 text-sm mb-3">{t.description}</p>
                    <div className="flex gap-2 flex-wrap">
                      <span className="px-2 py-0.5 bg-gray-800 text-gray-400 text-xs rounded-full">
                        {t.defaultTone}
                      </span>
                      {t.audience.slice(0, 2).map((a) => (
                        <span key={a} className="px-2 py-0.5 bg-indigo-900/40 text-indigo-400 text-xs rounded-full">
                          {a.replace(/_/g, ' ')}
                        </span>
                      ))}
                      {t.variables.length > 0 && (
                        <span className="px-2 py-0.5 bg-gray-800 text-gray-500 text-xs rounded-full">
                          {t.variables.length} var{t.variables.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
