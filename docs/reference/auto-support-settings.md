# Auto-Support Settings

The gear button on the **Auto Supports** card opens the settings dialog. It is
organized by the question you are asking, so you do not need to know how the
placement pipeline is built:

| Tab | Answers |
| --- | --- |
| **Detection** | What counts as a surface needing support, and how close two detections may be before they merge |
| **Distribution** | Where contacts land on a region, and how far a leaf may fan out from its trunk |
| **Density & Sizing** | How many supports, and how thick |
| **Stability** | How the part is held against toppling and peel |
| **Post-processing** | What happens after placement: how much one trunk may carry, and how completely gaps are filled |
| **Presets** | Which saved policy the run follows — see below |
| **Debug & Advanced** | Debug switches, the last run's diagnostics, and the measured calibration values |

Every control has a tooltip; hover the label or the control itself.

**Edits are staged.** Changing a knob or toggle in the dialog does nothing until
you press **Apply**; **Cancel** discards the edits. Selecting a *preset* is the
exception, and it is deliberate: picking a preset is choosing a policy for the
next run, so it applies immediately.

## Presets

A preset is a named set of auto-support settings — the whole run policy: density,
self-support angle, merge radius, fan limits and the sizing tier. Three ship with
the app:

- **Light** — sparse supports, detail sizing.
- **Medium** — balanced supports, structure sizing.
- **Heavy** — dense supports, anchor sizing.

They are also the three buttons on the Auto Supports card, so the quick-select
and the Presets tab are the same policy under the same names.

In the Presets tab you can:

- **Select** a preset: apply it to the current settings.
- **New**: save the current settings as a new preset and select it.
- **Save**: overwrite the selected preset with the current settings.
- **Revert**: reload the selected preset, discarding your edits.
- **Rename** and **Duplicate**, and **Delete** a preset you made.
- **Restore factory presets**: put the three built-ins back to their factory
  settings. Your own presets and your current settings are left alone.
- **Export** the selected preset to a JSON file, and **Import** one from a file.

When your settings no longer match the selected preset, the tab says so and
offers **Save** and **Revert**. Editing a knob never rewrites the preset by
itself.

The built-in presets cannot be renamed or deleted: their names are translated and
the file format is defined in terms of them. They *can* be saved over, which is
how you keep a tweaked density under a familiar name.

Files are described in [Auto-Support Preset Format](auto-support-preset-format.md).

### Not the Support Studio presets

Support Studio's presets — the Detail / Structure / Anchor cards you pick when
placing supports by hand — are a **different system**. They describe the geometry
of a *manually placed* support (tip, shaft, roots) and do not carry auto-support
settings; these auto-support presets describe how an automatic run is policed and
carry no geometry. They do not share storage, names or files, and changing one
does not change the other. See [Support Placement](../workflows/support-placement.md).

## Advanced (calibration)

The **Debug & Advanced** tab ends with the calibration group. These six values
are not preferences — they were measured against the printed result, and they
back the fit guarantee:

!!! warning "Calibration, not preferences"
    These six values were measured against the printed result, and they back the
    fit guarantee: a tip fits the feature it lands on, a hosted member is not a
    needle beside its host, and run-level factors only thicken (never thin) a
    support below its band. Change one and that guarantee no longer holds — reset
    them to the measured defaults before reporting a sizing problem.

Each slider shows the measured value it ships with, so you can always tell what
you changed. **Reset to measured defaults** puts all six back. The defaults come
from the same table the engine is built with, so the number shown is the number
the engine was tuned with.

## Related

- [Auto-Support Preset Format](auto-support-preset-format.md) — the export file
- [Support Placement](../workflows/support-placement.md) — placing supports by hand
- [Island Analysis Workflow](../workflows/island-analysis-workflow.md) — finding the surfaces supports go on
