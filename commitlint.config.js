module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat', // New feature
        'fix', // Bug fix
        'docs', // Documentation changes
        'style', // Code style changes (formatting, etc)
        'refactor', // Code refactoring
        'test', // Test additions or changes
        'chore', // Maintenance tasks
        'perf', // Performance improvements
        'ci', // CI/CD changes
        'build', // Build system changes
        'revert', // Revert previous commit
      ],
    ],
    'scope-enum': [
      2,
      'always',
      [
        'admin',
        'navigator',
        'worker',
        'shared',
        'ui',
        'config',
        'api',
        'auth',
        'coverage',
        'navigation',
        'database',
        'deps',
        'infra',
        'docs',
      ],
    ],
    'subject-case': [2, 'always', 'lower-case'],
    'header-max-length': [2, 'always', 100],
  },
};
