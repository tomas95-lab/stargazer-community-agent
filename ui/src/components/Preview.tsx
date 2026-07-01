import ReactMarkdown from 'react-markdown';

interface Props {
  content: string;
  label: string;
}

export default function Preview({ content, label }: Props) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
      <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 text-xs font-semibold text-gray-400 uppercase tracking-wider">
        {label}
      </div>
      <div className="p-5 prose prose-invert prose-sm max-w-none overflow-auto max-h-[600px]">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  );
}
