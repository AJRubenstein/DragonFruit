/**
 * Loads each type's renderer, which registers its detail renderer into the
 * seam. Kept as one import site so the shared renderer pulls in the whole set
 * at once -- and so a test can wire the seam without importing the whole
 * renderer. Mirrors `previewGeometry/registerBuiltinPreviewBuilders`.
 *
 * Loaded by the RENDERER, not the store: each entry closes over live scene
 * state, and pulling render-layer modules into the store's load reaches back
 * into the store it is still building.
 */
import '../SupportTypes/Trunk/TrunkRenderer';
import '../SupportTypes/Branch/BranchRenderer';
import '../SupportTypes/Leaf/LeafRenderer';
import '../SupportTypes/Brace/BraceRenderer';
import '../SupportTypes/Twig/TwigRenderer';
import '../SupportTypes/Stick/StickRenderer';
import '../SupportTypes/Kickstand/KickstandRenderer';
import '../SupportTypes/Anchor/AnchorRenderer';
