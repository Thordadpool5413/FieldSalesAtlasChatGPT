if (!process.env.npm_config_user_agent?.startsWith('pnpm/')) {
  console.error('Use pnpm install --frozen-lockfile from the repository root.');
  process.exit(1);
}
