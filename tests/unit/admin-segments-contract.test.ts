import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('admin-segments contract (Phase 11)', () => {
  it('admin-auth contains segments section for admin + manager', () => {
    const src = read('lib/admin-auth.ts');
    expect(src).toContain('"segments"');
    expect(src).toMatch(/administrator:[\s\S]*?"segments"/);
    expect(src).toMatch(/manager:[\s\S]*?\[.*"segments".*\]/);
  });

  it('AdminNav contains segments item', () => {
    const src = read('components/admin/AdminNav.tsx');
    expect(src).toContain("'segments'");
    expect(src).toContain("admin.navSegments");
  });

  it('segments page guards + force-dynamic + loadThresholds + SegmentCards', () => {
    const src = read('app/admin/segments/page.tsx');
    expect(src).toContain("requireRole('administrator', 'manager')");
    expect(src).toContain("force-dynamic");
    expect(src).toContain('loadThresholds');
    expect(src).toContain('SegmentCards');
  });

  it('SegmentCards and SegmentThresholdsForm have no leak strings', () => {
    for (const rel of ['components/admin/SegmentCards.tsx', 'components/admin/SegmentThresholdsForm.tsx']) {
      const src = read(rel);
      expect(src).not.toMatch(/providerCost/);
      expect(src).not.toMatch(/provider_cost/);
      expect(src).not.toMatch(/userId/);
    }
  });

  it('count route exists and contains requireRole', () => {
    const src = read('app/api/admin/segments/[name]/count/route.ts');
    expect(src).toContain('requireRole');
  });

  it('thresholds route contains requireRole and saveThresholds', () => {
    const src = read('app/api/admin/segments/thresholds/route.ts');
    expect(src).toContain('requireRole');
    expect(src).toContain('saveThresholds');
  });

  it('broadcast route accepts segment', () => {
    const src = read('app/api/admin/broadcast/route.ts');
    expect(src).toContain('segment');
  });

  it('broadcast page calls loadSegments', () => {
    const src = read('app/admin/broadcast/page.tsx');
    expect(src).toContain('loadSegments');
  });

  it('i18n has new segment keys', () => {
    const src = read('lib/i18n/messages/ru.ts');
    expect(src).toContain('navSegments');
    expect(src).toContain('segmentsTitle');
    expect(src).toContain('segmentsEmpty');
  });
});
