import ReactMarkdown from 'react-markdown';

interface Props {
  content: string;
  label: string;
}

export default function Preview({ content, label }: Props) {
  return (
    <div className="sg-panel overflow-hidden">
      <div className="sg-panel-header px-4 py-2 text-xs font-semibold uppercase text-muted-foreground">
        {label}
      </div>
      <div className="prose prose-sm max-h-[600px] max-w-none overflow-auto p-5 text-foreground">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  );
}
