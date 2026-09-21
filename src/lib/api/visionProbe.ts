// Self-authored 96x48 red-left/blue-right PNG, independent of third-party content.
export const VISION_PROBE_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAAAwCAIAAABhdOiYAAAAcUlEQVR4nO3QQQnAABDEwPNvuhVQAdnCQP6Bueduqvr/qf4DAgQI0FL1HxAgQICmqv+AAAECtFT9BwQIEKCp6j8gQIAALVX/AQECBGiq+g8IECBAS9V/QIAAAZqq/gMCBAjQUvUfECBAgKaq/4B+DvQC/ozvAMlEKtoAAAAASUVORK5CYII=";
export const VISION_PROBE_PROMPT = "Inspect this image. What is the color of the left half and of the right half? Reply only with JSON keys left and right, using English color names.";

export function isCorrectVisionProbeAnswer(text: string): boolean {
  try {
    const clean = text.trim().replace(/^\x60{3}(?:json)?\s*/i, "").replace(/\s*\x60{3}$/, "");
    const answer = JSON.parse(clean);
    return answer.left?.toLowerCase() === "red" && answer.right?.toLowerCase() === "blue";
  } catch {
    return false;
  }
}
