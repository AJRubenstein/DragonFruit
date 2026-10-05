import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSceneSliceRun, resolveSceneSliceJob, type SceneSliceJobOptions } from '../../../../scripts/cli/sceneSliceJob';
import type { SavedCurve } from '../lutCurves';
import type { SliceJobAntiAliasingRequest } from '../sliceAntiAliasing';
import { describeSliceJobModel } from '../sliceJobAssembly';
import { captureAppSliceJob, cubeModel, type CapturedSliceJob } from './helpers/captureAppSliceJob';
import { MATERIALS, PRINTERS, appMaterial, comparableMetadata, material } from './helpers/sliceJobFixtures';

/**
 * `scene slice` claims to build the job the app would. This compares the two on
 * the job fields the CLI controls: the app's side is the real orchestrator,
 * captured at the Tauri boundary; the CLI's side is the argv it hands
 * `dragonfruit-cli slice run`.
 *
 * Anti-aliasing is compared on the fields `slice run` has flags for. The Z-blend
 * alphas, the LUT and the 3DAA sampling settings have none yet, so they cannot
 * differ through the argv and are not checked here.
 */

const STEEP_CURVE: SavedCurve = {
  id: 'steep',
  name: 'Steep',
  points: [{ x: 0, y: 0.2 }, { x: 0.5, y: 0.4 }, { x: 1, y: 0.75 }],
};

/** Reads the `slice run` flags back into the native job's field names. */
function cliJob(argv: string[]): Record<string, unknown> {
  const value = (flag: string) => {
    const index = argv.indexOf(flag);
    return index < 0 ? undefined : argv[index + 1];
  };
  const number = (flag: string) => (value(flag) === undefined ? undefined : Number(value(flag)));
  const dither = argv.includes('--dither');
  return {
    source_width_px: number('--source-width-px'),
    source_height_px: number('--source-height-px'),
    x_packing_mode: value('--x-packing-mode') ?? 'none',
    mirror_x: argv.includes('--mirror-x'),
    mirror_y: argv.includes('--mirror-y'),
    format_version: value('--format-version') ?? null,
    build_width_mm: number('--build-width-mm'),
    build_depth_mm: number('--build-depth-mm'),
    layer_height_mm: number('--layer-height'),
    dither_enabled: dither,
    dither_bit_depth: dither ? number('--dither-bit-depth') : null,
    dither_device_gamma: dither ? number('--dither-device-gamma') : null,
    metadata_json: value('--metadata-json') ?? '{}',
    anti_aliasing_level: value('--anti-aliasing') ?? 'Off',
    anti_aliasing_mode: value('--anti-aliasing-mode') ?? 'Blur',
    blur_brush_radius_px: number('--blur-brush-radius-px') ?? 1,
    blur_brush_kernel: value('--blur-brush-kernel') ?? 'gaussian',
    blur_brush_sigma_x: number('--blur-brush-sigma-x') ?? 0.5,
    blur_brush_sigma_y: number('--blur-brush-sigma-y') ?? 0.5,
    z_blur_radius_layers: number('--z-blur-radius-layers') ?? 0,
    z_blur_kernel: value('--z-blur-kernel') ?? 'box',
    z_blur_sigma: number('--z-blur-sigma') ?? 0.5,
    z_blend_look_back: number('--z-blend-look-back') ?? 2,
    aa_on_supports: argv.includes('--aa-on-supports'),
    minimum_aa_alpha_percent: number('--min-aa-alpha') ?? 0,
  };
}

const AA_FIELDS = [
  'anti_aliasing_level',
  'anti_aliasing_mode',
  'blur_brush_radius_px',
  'blur_brush_kernel',
  'blur_brush_sigma_x',
  'blur_brush_sigma_y',
  'z_blur_radius_layers',
  'z_blur_kernel',
  'z_blur_sigma',
  'z_blend_look_back',
  'aa_on_supports',
  'minimum_aa_alpha_percent',
] as const;

/** The same anti-aliasing choice, as the CLI flags take it and as the panel hands it over. */
type AaScenario = { label: string; cli: SceneSliceJobOptions; app: SliceJobAntiAliasingRequest };

const AA_SCENARIOS: AaScenario[] = [
  // No flags: the panel's default preset and the material's own settings.
  { label: 'default AA', cli: {}, app: { preset: 'balanced', override: null } },
  { label: 'AA smooth', cli: { aaPreset: 'smooth' }, app: { preset: 'smooth', override: null } },
  { label: 'AA raw', cli: { aaPreset: 'raw' }, app: { preset: 'raw', override: null } },
  {
    label: 'AA settings, 3DAA with a custom curve',
    cli: {
      aaSettings: {
        antiAliasingSettings: { mode: '3DAA', level: '16x', zBlendResinType: 'custom', selectedLutCurveId: 'steep', aaOnSupports: true },
        minimumAaAlphaPercent: 20,
      },
      lutCurves: [STEEP_CURVE],
    },
    app: {
      preset: 'balanced',
      override: {
        antiAliasingSettings: {
          enableOverride: true, mode: '3DAA', level: '16x', zBlendResinType: 'custom', selectedLutCurveId: 'steep', aaOnSupports: true,
        },
        minimumAaAlphaPercent: 20,
      },
      lutCurves: [STEEP_CURVE],
    },
  },
];


type Aspect = {
  name: string;
  compare: (app: CapturedSliceJob, cli: Record<string, unknown>) => void;
};

const ASPECTS: Aspect[] = [
  {
    name: 'raster grid and mirroring',
    compare: (app, cli) => {
      for (const key of ['source_width_px', 'source_height_px', 'mirror_x', 'mirror_y']) {
        assert.equal(cli[key], app[key], key);
      }
    },
  },
  {
    name: 'format version',
    compare: (app, cli) => assert.equal(cli.format_version, app.format_version),
  },
  {
    name: 'x-packing',
    compare: (app, cli) => assert.equal(cli.x_packing_mode, app.x_packing_mode),
  },
  {
    name: 'build volume',
    compare: (app, cli) => {
      assert.equal(cli.build_width_mm, app.build_width_mm, 'build_width_mm');
      assert.equal(cli.build_depth_mm, app.build_depth_mm, 'build_depth_mm');
    },
  },
  {
    name: 'layer height',
    compare: (app, cli) => assert.equal(cli.layer_height_mm, app.layer_height_mm),
  },
  {
    name: 'dithering',
    compare: (app, cli) => {
      assert.equal(cli.dither_enabled, app.dither_enabled, 'dither_enabled');
      if (app.dither_enabled) {
        assert.equal(cli.dither_bit_depth, app.dither_bit_depth, 'dither_bit_depth');
        assert.equal(cli.dither_device_gamma, app.dither_device_gamma, 'dither_device_gamma');
      }
    },
  },
  {
    name: 'anti-aliasing',
    compare: (app, cli) => {
      for (const key of AA_FIELDS) assert.equal(cli[key], app[key as keyof CapturedSliceJob], key);
    },
  },
  {
    name: 'encoder metadata',
    compare: (app, cli) => assert.deepEqual(
      comparableMetadata(cli.metadata_json as string),
      comparableMetadata(app.metadata_json),
    ),
  },
];

for (const printer of PRINTERS) {
  for (const materialFixture of MATERIALS) {
    for (const aa of AA_SCENARIOS) {
      const caseLabel = `${printer.label}, material ${materialFixture.label}, ${aa.label}`;
      let jobs: Promise<{ app: CapturedSliceJob; cli: Record<string, unknown> }> | undefined;
      const bothJobs = () => {
        jobs ??= (async () => {
          const cube = cubeModel('parity-cube', 10);
          const appPrinter = printer.appPrinter();
          const app = await captureAppSliceJob({
            models: [cube],
            printerProfile: appPrinter,
            materialProfile: appMaterial(appPrinter, material(materialFixture)),
            extraOptions: { antiAliasing: aa.app },
          });
          const cli = cliJob(buildSceneSliceRun(
            resolveSceneSliceJob({ printer: printer.cliPrinter(), material: material(materialFixture), ...aa.cli }),
            { maxZMm: 10, models: [describeSliceJobModel(cube)] },
            'positions.bin',
            'out',
          ).args);
          return { app, cli };
        })();
        return jobs;
      };

      for (const aspect of ASPECTS) {
        test(`scene slice matches the app: ${aspect.name} (${caseLabel})`, async () => {
          const { app, cli } = await bothJobs();
          aspect.compare(app, cli);
        });
      }
    }
  }
}
