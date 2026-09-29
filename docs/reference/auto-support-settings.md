# Auto-Support Settings

The gear button on the **Auto Supports** card opens the settings dialog. It is
organized by the question you are asking, so you do not need to know how the
placement pipeline is built:

| Section | Answers |
| --- | --- |
| **Detection** | What counts as a surface needing support, and how close two detections may be before they merge |
| **Distribution** | Where contacts land on a region, and how far a leaf may fan out from its trunk |
| **Density & Sizing** | How many supports, how thick, and which sizing band they are built from |
| **Stability** | How the part is held against toppling and peel |
| **Post-processing** | What happens after placement: how much one trunk may carry, and how completely gaps are filled |
| **Debug & Advanced** | Debug switches, the last run's diagnostics, and the measured calibration values |

Every section is a card of fields on one scrolling page — there is no tab to
switch to, and the whole policy fits without one. Every field has a label, a ⓘ
with its help text, and its own tooltip on hover. Numbers are typed or stepped
with the field's own carets rather than dragged on a slider, and each one carries
its unit in the label (`Min Island Size (mm²)`, `Fan Angle (°)`, `Coverage Target
(%)`). A switch is a pill; the sizing band is the three-way **Detail /
Structure / Anchor** control at the top of **Density & Sizing**.

**Edits are staged.** Changing a field or a switch in the dialog does nothing
until you press **Apply**; **Cancel** discards the edits. Selecting a *preset* is
the exception, and it is deliberate: picking a preset is choosing a policy for
the next run, so it applies immediately.

## Presets

A preset is a named set of auto-support settings — the whole run policy: density,
self-support angle, merge radius, fan limits and the sizing tier. Three ship with
the app:

- **Light** — sparse supports, detail sizing.
- **Medium** — balanced supports, structure sizing.
- **Heavy** — dense supports, anchor sizing.

They are also the three buttons on the Auto Supports card, so the quick-select
and the preset selector are the same policy under the same names.

The selector at the top of the dialog shows the preset your settings are; its
menu lists the presets — built-ins first, then your own, each with its sizing
tier and whether it is a built-in, the one in use ticked. Beside the selector:

- **Save**: overwrite the selected preset with the settings shown here.
- **Revert**: reload the selected preset, discarding your edits.

The row of buttons under it manages the collection:

- **New**: save the current settings as a new preset and select it.
- **Rename** and **Duplicate** the selected preset; **Delete** it, on the right
  in red. Rename and Delete are refused for the built-ins, whose names are
  translated and whose ids define the file format.
- **Import** a preset from a JSON file and apply it; **Export** the selected
  preset to a JSON file.
- **Restore factory presets**: put the three built-ins back to their factory
  settings. Your own presets and your current settings are left alone.

When your settings no longer match the selected preset, the strip says so.
Editing a field never rewrites the preset by itself.

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

**Debug & Advanced** is the closed section at the bottom of the dialog — click it
to open it. It holds the debug switches and the last run's diagnostics, and it
ends with the calibration group. These six values are not preferences — they were
measured against the printed result, and they back the fit guarantee:

!!! warning "Calibration, not preferences"
    These six values were measured against the printed result, and they back the
    fit guarantee: a tip fits the feature it lands on, a hosted member is not a
    needle beside its host, and run-level factors only thicken (never thin) a
    support below its band. Change one and that guarantee no longer holds — reset
    them to the measured defaults before reporting a sizing problem.

Each field shows the measured value it ships with underneath it, so you can
always tell what you changed. **Reset to measured defaults** puts all six back.
The defaults come from the same table the engine is built with, so the number
shown is the number the engine was tuned with.

## Related

- [Auto-Support Preset Format](auto-support-preset-format.md) — the export file
- [Support Placement](../workflows/support-placement.md) — placing supports by hand
- [Island Analysis Workflow](../workflows/island-analysis-workflow.md) — finding the surfaces supports go on
