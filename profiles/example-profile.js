// Example profile. Copy to profiles/profile.js and edit; see profiles/README.md.
window.PROJECT_PROFILE = {
  name: 'My app',

  // framework: 'laravel',

  // tables holding people: a cascade that would erase one of these is flagged
  peopleTables: ['users', 'customers'],

  // empty or quiet on purpose
  keep: ['failed_jobs', 'password_reset_tokens'],

  // findings reviewed and kept on purpose
  accepted: [
    // { kind: 'missing-fk', table: 'orders', column: 'legacy_id', reason: 'Points to the old system; no table here.' }
  ]
};
