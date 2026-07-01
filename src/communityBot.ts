import { chromium, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { BotConfig, PATHS } from './config';

const CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];

function findChrome(): string | undefined {
  for (const p of CHROME_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

export class CommunityBot {
  private config: BotConfig;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  constructor(config: BotConfig) {
    this.config = config;
  }

  async launch(): Promise<void> {
    const chromePath = findChrome();

    this.context = await chromium.launchPersistentContext(this.config.browserProfilePath, {
      headless: this.config.headless,
      slowMo: this.config.slowMo,
      viewport: { width: 1280, height: 900 },
      executablePath: chromePath,
    });

    if (chromePath) console.log(`🌍 Using system Chrome`);
    this.page = this.context.pages()[0] || (await this.context.newPage());
  }

  async publishDailyThread(title: string, body: string, tags?: string[]): Promise<string> {
    if (!this.page || !this.context) {
      throw new Error('Browser not launched. Call launch() first.');
    }

    const page = this.page;
    const sel = this.config.selectors;

    await page.goto(this.config.communityNewTopicUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    await this.handleLoginIfNeeded(page, this.config.communityNewTopicUrl);

    await page.waitForTimeout(2000);

    try {
      await page.waitForSelector(sel.titleInput, { timeout: 15_000 });
    } catch {
      await this.captureError('title-input-not-found');
      throw new Error(
        `Could not find title input with selector: ${sel.titleInput}\n` +
          'Check output/ for error screenshot and HTML dump.'
      );
    }

    const titleEl = page.locator(sel.titleInput).first();
    await titleEl.click();
    await titleEl.fill(title);
    await titleEl.dispatchEvent('input');
    await titleEl.dispatchEvent('change');
    await page.waitForTimeout(500);

    try {
      await page.waitForSelector(sel.bodyInput, { timeout: 10_000 });
    } catch {
      await this.captureError('body-input-not-found');
      throw new Error(
        `Could not find body input with selector: ${sel.bodyInput}\n` +
          'Check output/ for error screenshot and HTML dump.'
      );
    }

    const bodyEl = page.locator(sel.bodyInput).first();
    await bodyEl.click();

    await page.evaluate(async (text) => {
      await navigator.clipboard.writeText(text);
    }, body);
    await page.keyboard.press('Meta+a');
    await page.keyboard.press('Meta+v');
    await page.waitForTimeout(2000);

    if (tags && tags.length > 0) {
      await this.selectTags(page, sel, tags);
    }

    console.log('👀 Preview mode: review the post in the browser. Press Enter in the terminal to publish...');
    await new Promise<void>((resolve) => {
      const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
      rl.question('', () => { rl.close(); resolve(); });
    });

    let createButton;
    try {
      createButton = page.locator(sel.createTopicButton).first();
      await createButton.waitFor({ timeout: 10_000 });
    } catch {
      await this.captureError('create-button-not-found');
      throw new Error(
        `Could not find "Create Topic" button with selector: ${sel.createTopicButton}\n` +
          'Check output/ for error screenshot and HTML dump.'
      );
    }

    await createButton.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await createButton.click({ force: true });
    console.log('🖱️  Clicked Create Topic');

    await page.waitForTimeout(3000);

    const errorPopup = await page.locator('.dialog-body, .alert-error, .errors, .popup-tip').first().isVisible().catch(() => false);
    if (errorPopup) {
      const errorText = await page.locator('.dialog-body, .alert-error, .errors, .popup-tip').first().textContent().catch(() => 'unknown');
      await this.captureError('discourse-validation-error');
      throw new Error(`Discourse validation error: ${errorText}`);
    }

    try {
      await page.waitForURL((url) => {
        const u = url.toString();
        return u.includes('/t/') && !u.includes('/new-topic');
      }, { timeout: 60_000 });
    } catch {
      await this.captureError('publish-navigation-failed');
      throw new Error(
        'The page did not navigate to a published topic URL after clicking Create.\n' +
          'Check output/ for error screenshot and HTML dump.'
      );
    }

    const publishedUrl = page.url();
    console.log(`🔗 Published URL: ${publishedUrl}`);
    return publishedUrl;
  }

  async postAnnouncementToChat(announcement: string): Promise<void> {
    if (!this.page || !this.context) {
      throw new Error('Browser not launched. Call launch() first.');
    }

    const page = this.page;
    const chatSel = this.config.chatSelectors;

    console.log(`💬 Navigating to chat: ${this.config.communityChatUrl}`);
    await page.goto(this.config.communityChatUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    await this.handleLoginIfNeeded(page, this.config.communityChatUrl);

    await page.waitForTimeout(2000);

    try {
      await page.waitForSelector(chatSel.messageInput, { timeout: 15_000 });
    } catch {
      await this.captureError('chat-input-not-found');
      throw new Error(
        `Could not find chat message input with selector: ${chatSel.messageInput}\n` +
          'Check output/ for error screenshot and HTML dump.'
      );
    }

    const input = page.locator(chatSel.messageInput).first();
    await input.click();
    await input.fill(announcement);
    await page.waitForTimeout(500);

    try {
      const sendBtn = page.locator(chatSel.sendButton).first();
      await sendBtn.waitFor({ timeout: 5_000 });
      await sendBtn.click();
    } catch {
      console.log('⚠️  Send button not found, trying Enter key...');
      await input.press('Enter');
    }

    await page.waitForTimeout(2000);
    console.log('✅ Announcement posted to chat');
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
      this.page = null;
    }
  }

  private async selectTags(page: Page, sel: BotConfig['selectors'], tags: string[]): Promise<void> {
    try {
      const tagChooser = page.locator(sel.tagChooser).first();
      await tagChooser.waitFor({ timeout: 5_000 });
      await tagChooser.click();
      await page.waitForTimeout(500);

      for (const tag of tags) {
        const tagInput = page.locator(sel.tagInput).first();
        await tagInput.waitFor({ timeout: 5_000 });
        await tagInput.fill(tag);
        await page.waitForTimeout(1000);

        const tagRow = page.locator(sel.tagOption(tag)).first();
        try {
          await tagRow.waitFor({ timeout: 5_000 });
          await tagRow.click();
        } catch {
          console.log(`⚠️  Tag "${tag}" not found in dropdown, trying Enter...`);
          await tagInput.press('Enter');
        }
        await page.waitForTimeout(500);
      }

      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      console.log(`🏷️  Tags selected: ${tags.join(', ')}`);
    } catch (err) {
      console.log(`⚠️  Could not set tags: ${err instanceof Error ? err.message : err}`);
      await this.captureError('tag-selection-failed');
    }
  }

  private async handleLoginIfNeeded(page: Page, targetUrl: string): Promise<void> {
    const baseUrl = this.config.communityBaseUrl;
    const currentUrl = page.url();

    const isOnCommunity = currentUrl.startsWith(baseUrl) && !currentUrl.includes('/login') && !currentUrl.includes('/session');
    const hasLoginForm = await page.locator('input[type="password"], #login-account-password, .login-form, button:has-text("Log In"), button:has-text("Continue with Google")').count() > 0;
    const isOnGoogle = currentUrl.includes('accounts.google.com');

    if (!isOnCommunity || hasLoginForm || isOnGoogle) {
      console.log('🔐 Login required. Please log in manually in the browser window.');
      console.log('   The bot will wait up to 5 minutes for you to reach Community...');

      await page.waitForURL(
        (url) => url.toString().startsWith(baseUrl) && !url.toString().includes('/login') && !url.toString().includes('/session'),
        { timeout: 300_000 }
      );

      await page.waitForTimeout(3000);

      if (!page.url().includes(new URL(targetUrl).pathname.split('?')[0])) {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await page.waitForTimeout(2000);
      }

      console.log('✅ Login complete. Continuing...');
    }
  }

  private async captureError(label: string): Promise<void> {
    if (!this.page) return;
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = path.join(PATHS.output, `error-${label}-${ts}.png`);
    const htmlPath = path.join(PATHS.output, `error-${label}-${ts}.html`);

    try {
      await this.page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`📸 Error screenshot saved: ${screenshotPath}`);
    } catch {
      console.log('⚠️  Could not capture screenshot');
    }

    try {
      const html = await this.page.content();
      fs.writeFileSync(htmlPath, html, 'utf-8');
      console.log(`📄 Error HTML saved: ${htmlPath}`);
    } catch {
      console.log('⚠️  Could not capture HTML');
    }
  }
}
