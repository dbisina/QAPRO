import { describe, expect, it } from 'vitest';
import { evaluate } from '../.claude/hooks/guard.mjs';

const blocked = (command: string, env: Record<string, string> = {}) => evaluate(command, env).block;

describe('guard hook — always', () => {
  it.each([
    'rm -rf out',
    'rm -r -f /tmp/x',
    'Remove-Item C:\\data -Recurse -Force',
    'git push --force origin main',
    'git push -f',
    'git reset --hard HEAD~1',
    'psql -c "DROP TABLE users"',
    'sqlcmd -Q "delete from orders"',
    'terraform destroy -auto-approve',
    'az group delete -n rg-prod',
    'kubectl delete pod x',
    'az keyvault secret show --name db',
    'cat .env',
    'cat ./.env.local',
  ])('blocks %s', (command) => {
    expect(blocked(command)).toBe(true);
  });

  it.each([
    'rm -f report.xml',
    'npm run rm-dist',
    'npx playwright test --grep @TC12',
    'git push origin feature/tests',
    'az boards work-item show --id 5',
    'curl -X POST https://uat.example.com/api/orders',
    'k6 run load.js',
    'node --env-file-if-exists=config.json app.js',
  ])('allows %s outside prod', (command) => {
    expect(blocked(command)).toBe(false);
  });
});

describe('guard hook — prod is read-only', () => {
  const prod = { QA_ENV: 'prod' };
  it.each([
    'curl -X POST https://api.example.com/orders',
    'curl https://api.example.com/orders -d @body.json',
    'Invoke-RestMethod -Uri https://api -Method Delete',
    'az webapp restart -n app',
    'k6 run load.js',
    'docker run zaproxy zap-full-scan.py -t https://x',
    'git push origin main',
  ])('blocks %s', (command) => {
    expect(blocked(command, prod)).toBe(true);
  });

  it('allows read-only smoke checks', () => {
    expect(blocked('curl -fsS https://api.example.com/health', prod)).toBe(false);
    expect(blocked('npx playwright test --grep @smoke', prod)).toBe(false);
  });
});
