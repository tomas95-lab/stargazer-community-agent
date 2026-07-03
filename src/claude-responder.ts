import {
  fetchRecentCommunityMessages,
  runCommunityAgent,
  type CommunityAgentOptions,
  type CommunityAgentResult,
} from './community-agent';

export { fetchRecentCommunityMessages };
export type ClaudeResponderOptions = CommunityAgentOptions;
export type ClaudeResponderResult = CommunityAgentResult;

export async function runClaudeResponder(options: ClaudeResponderOptions = {}): Promise<ClaudeResponderResult> {
  return runCommunityAgent({
    includeCommunity: true,
    includeDms: true,
    onlyToday: true,
    ...options,
  });
}

if (require.main === module) {
  const post = process.argv.includes('--post') && !process.argv.includes('--dry-run');
  runClaudeResponder({ post }).then((result) => {
    console.log(JSON.stringify(result, null, 2));
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
