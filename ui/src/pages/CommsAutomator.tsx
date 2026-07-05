import { useState, useEffect } from 'react';
import type { ComponentType } from 'react';
import {
  AlertTriangle,
  ClipboardCheck,
  GraduationCap,
  Headphones,
  KeyRound,
  MessageSquareText,
  PenLine,
  Radio,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import { api, type CommsTemplate } from '../api';
import CommsForm from '../components/CommsForm';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

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

const CATEGORY_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  urgent_alert: AlertTriangle,
  webinar_alignment: Radio,
  war_room: Headphones,
  throttle_quality: SlidersHorizontal,
  reviewer_qma_allocation: Users,
  onboarding: GraduationCap,
  access_cursor_setup: KeyRound,
  quality_feedback_escalation: ClipboardCheck,
  daily_thread_announcement: MessageSquareText,
  custom: PenLine,
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

  const ActiveIcon = CATEGORY_ICONS[activeCategory];

  return (
    <div className="flex min-h-[600px] gap-6 px-6">
      <aside className="w-52 shrink-0">
        <Card className="overflow-hidden p-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => { setActiveCategory(cat.id); setSelectedTemplate(null); }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-colors',
                activeCategory === cat.id
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              {(() => {
                const Icon = CATEGORY_ICONS[cat.id];
                return <Icon className="size-4" />;
              })()}
              <span>{cat.label}</span>
            </button>
          ))}
        </Card>
      </aside>

      <div className="flex-1 min-w-0">
        {selectedTemplate ? (
          <CommsForm
            template={selectedTemplate}
            onBack={() => setSelectedTemplate(null)}
          />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <ActiveIcon className="size-5 text-primary" />
              <h2 className="text-xl font-semibold text-foreground">
                {CATEGORIES.find((c) => c.id === activeCategory)?.label}
              </h2>
            </div>

            {loading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : templates.length === 0 ? (
              <p className="text-muted-foreground">No templates in this category.</p>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTemplate(t)}
                    className="group rounded-lg border border-border bg-card p-5 text-left transition-colors hover:border-primary/50 hover:bg-secondary"
                  >
                    <h3 className="mb-1 font-semibold text-foreground transition-colors group-hover:text-primary">
                      {t.name}
                    </h3>
                    <p className="mb-3 text-sm text-muted-foreground">{t.description}</p>
                    <div className="flex gap-2 flex-wrap">
                      <Badge variant="secondary">
                        {t.defaultTone}
                      </Badge>
                      {t.audience.slice(0, 2).map((a) => (
                        <Badge key={a} variant="outline">
                          {a.replace(/_/g, ' ')}
                        </Badge>
                      ))}
                      {t.variables.length > 0 && (
                        <Badge variant="outline" className="text-muted-foreground">
                          {t.variables.length} var{t.variables.length !== 1 ? 's' : ''}
                        </Badge>
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
