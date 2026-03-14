import json
import torch
import comfy.samplers
import comfy.utils
from comfy.samplers import SchedulerHandler

WEB_DIRECTORY = "./web"


def capitan_zit_scheduler(model, steps):
    device = comfy.model_management.get_torch_device()
    return torch.linspace(1.0, 0.0, steps + 1).to(device)


comfy.samplers.SCHEDULER_HANDLERS["capitanZiT"] = SchedulerHandler(capitan_zit_scheduler, use_ms=True)
comfy.samplers.SCHEDULER_NAMES.append("capitanZiT")


class CapitanZiTLinearSigma:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "steps": ("INT", {"default": 9, "min": 1, "max": 100, "step": 1}),
            }
        }

    RETURN_TYPES = ("SIGMAS",)
    FUNCTION = "generate"
    CATEGORY = "sampling/custom_sampling/sigmas"
    DESCRIPTION = "Generates linear sigma schedule (1.0 → 0.0) for CapitanZiT"

    def generate(self, steps):
        device = comfy.model_management.get_torch_device()
        return (torch.linspace(1.0, 0.0, steps + 1).to(device),)


class FlowMatchSchedulerKleinEdit:

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "steps": ("INT", {
                    "default": 4, "min": 1, "max": 100,
                    "tooltip": "Total sigma steps. Klein native=4."
                }),
                "denoise": ("FLOAT", {
                    "default": 1.0, "min": 0.001, "max": 2.0, "step": 0.001,
                    "tooltip": "Starting sigma / edit strength."
                }),
                "sigma_min": ("FLOAT", {
                    "default": 0.0, "min": 0.0, "max": 1.0, "step": 0.001,
                    "tooltip": "Ending sigma. Raise to 0.01-0.03 to soften final step."
                }),
                "shift": ("FLOAT", {
                    "default": 1.0, "min": 0.01, "max": 20.0, "step": 0.01,
                    "tooltip": "Timestep shift. >1=more steps at high sigma."
                }),
                "curve": ("FLOAT", {
                    "default": 1.0, "min": 0.01, "max": 10.0, "step": 0.01,
                    "tooltip": "Power curve. <1=bunch at start. >1=bunch at end."
                }),
            },
            # optional: never block execution if missing or malformed
            "optional": {
                "draw_mode":     ("STRING", {"default": "parametric"}),
                "custom_sigmas": ("STRING", {"default": "[]"}),
            }
        }

    RETURN_TYPES = ("MODEL", "SIGMAS")
    FUNCTION = "get_sigmas"
    CATEGORY = "sampling/custom_sampling/schedulers"
    DESCRIPTION = "Full-control Klein Edit scheduler with interactive + drawable graph."

    def get_sigmas(self, model, steps, denoise, sigma_min, shift, curve,
                   draw_mode="parametric", custom_sigmas="[]"):
        device = comfy.model_management.get_torch_device()

        # Draw mode — use the hand-drawn sigma array directly
        if draw_mode == "draw":
            try:
                vals = json.loads(custom_sigmas)
                if isinstance(vals, list) and len(vals) >= 2:
                    sigmas = torch.tensor(vals, dtype=torch.float32).to(device)
                    # Sampler expects a terminal 0
                    if sigmas[-1] > 1e-6:
                        sigmas = torch.cat([sigmas, torch.zeros(1, device=device)])
                    return (model, sigmas)
            except Exception:
                pass  # fall through to parametric on any error

        # Parametric mode
        if steps < 1:
            return (model, torch.tensor([denoise, 0.0], dtype=torch.float32).to(device))

        t = torch.linspace(0, 1, steps + 1)
        if abs(curve - 1.0) > 0.001:
            t = t ** curve
        if abs(shift - 1.0) > 0.001:
            t = t / (t + shift * (1.0 - t))

        sigmas = denoise * (1.0 - t) + sigma_min * t
        sigmas[0] = denoise
        sigmas[-1] = sigma_min

        if sigma_min > 1e-6:
            sigmas = torch.cat([sigmas, torch.zeros(1)])

        return (model, sigmas.to(device))


NODE_CLASS_MAPPINGS = {
    "CapitanZiTLinearSigma": CapitanZiTLinearSigma,
    "FlowMatchSchedulerKleinEdit": FlowMatchSchedulerKleinEdit,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "CapitanZiTLinearSigma": "CapitanZiT Linear Sigma (for Z-Image Turbo)",
    "FlowMatchSchedulerKleinEdit": "Klein Edit Scheduler",
}
