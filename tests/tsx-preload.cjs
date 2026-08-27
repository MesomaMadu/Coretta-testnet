if (typeof process.geteuid !== "function") {
  process.geteuid = () => 0;
}

const preloadFlag = `--require=${__filename}`;
if (!process.env.NODE_OPTIONS?.includes(preloadFlag)) {
  process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, preloadFlag].filter(Boolean).join(" ");
}
