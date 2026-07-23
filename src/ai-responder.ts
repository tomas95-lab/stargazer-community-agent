import {
  fetchRecentCommunityMessages,
  runCommunityAgent,
  type CommunityAgentOptions,
  type CommunityAgentResult,
} from './community-agent';

export { fetchRecentCommunityMessages };
export type AiResponderOptions = CommunityAgentOptions;
export type AiResponderResult = CommunityAgentResult;

export async function runAiResponder(options: AiResponderOptions = {}): Promise<AiResponderResult> {
  return runCommunityAgent({
    includeCommunity: true,
    onlyToday: true,
    ...options,
  });
}

if (require.main === module) {
  const post = process.argv.includes('--post') && !process.argv.includes('--dry-run');
  runAiResponder({ post }).then((result) => {
    console.log(JSON.stringify(result, null, 2));
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
