import { ClientImportForm } from './import-form';

/**
 * CSV import for clients — round-trip companion to the bulk Export
 * CSV. Paste or upload, preview the parsed plan, then commit.
 */
export default function ClientImportPage() {
  return <ClientImportForm />;
}
