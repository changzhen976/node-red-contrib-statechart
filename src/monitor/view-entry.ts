// Registers <scxml-view>. The element loads its data-model engine on demand;
// the monitor uses trusted + autostart=false, so no QuickJS WASM is fetched.
import '@tinyactors/scxmljs/view'
