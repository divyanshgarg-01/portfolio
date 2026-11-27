import { test } from '@playwright/test';

test.describe('Supabase role boundaries', () => {
  test.skip('editor/viewer RLS boundaries need provisioned Supabase users and credentials', () => {
    // Not executable against DATA_MODE=local: the local adapter has no per-user RLS.
    // To cover this, supply DATA_MODE=supabase plus SUPABASE_* credentials and seed
    // owner/editor/viewer accounts, then verify:
    //  - an editor cannot PATCH /api/admin/singletons/settings or DELETE a project;
    //  - a viewer cannot POST /api/admin/projects, upload media, or publish drafts;
    //  - Supabase RLS blocks direct table/storage access with editor/viewer tokens.
  });
});
