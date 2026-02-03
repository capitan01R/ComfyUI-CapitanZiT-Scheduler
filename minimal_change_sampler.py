"""
Minimal Change Flow Sampler
============================
A stable sampler for flow matching models that limits maximum change per step.
Prevents drift and artifacts while maintaining image quality.
"""

import torch
from tqdm import trange
import comfy.samplers


def sample_minimal_change_flow(model, x, sigmas, extra_args=None, callback=None, disable=None,
                               max_change_per_step=0.7):
    """
    Minimal Change Flow sampler - limits maximum relative change per step.
    
    This sampler uses pure interpolation and enforces a maximum change constraint
    to prevent large deviations that can cause drift or artifacts.
    
    Args:
        model: The diffusion model
        x: Initial latent tensor
        sigmas: Sigma schedule (typically 1.0 → 0.0 for flow matching)
        max_change_per_step: Maximum relative change allowed per step (default: 0.7)
    
    Returns:
        Denoised latent tensor
    """
    extra_args = {} if extra_args is None else extra_args
    s_in = x.new_ones([x.shape[0]])
    
    for i in trange(len(sigmas) - 1, disable=disable):
        sigma = sigmas[i]
        sigma_next = sigmas[i + 1]
        
        # Get model prediction
        denoised = model(x, sigma * s_in, **extra_args)
        
        # Callback for progress tracking
        if callback is not None:
            callback({
                'x': x,
                'i': i,
                'sigma': sigma,
                'sigma_hat': sigma,
                'denoised': denoised
            })
        
        # Final step: return denoised result
        if sigma_next == 0:
            x = denoised
            break
        
        # Standard Euler step with change limiting
        if sigma > 1e-6:
            ratio = sigma_next / sigma
            x_new = ratio * x + (1.0 - ratio) * denoised
            
            # Calculate and limit the change
            delta = x_new - x
            delta_magnitude = delta.abs().mean()
            x_magnitude = x.abs().mean() + 1e-8
            
            relative_change = delta_magnitude / x_magnitude
            
            if relative_change > max_change_per_step:
                # Scale down the change to stay within limit
                scale = max_change_per_step / (relative_change + 1e-8)
                x = x + delta * scale
            else:
                x = x_new
        else:
            x = denoised
    
    return x


class SamplerMinimalChangeFlow:
    """
    ComfyUI node for Minimal Change Flow sampler.
    """
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "max_change_per_step": ("FLOAT", {
                    "default": 0.70, 
                    "min": 0.05, 
                    "max": 1.0, 
                    "step": 0.05,
                    "tooltip": "Maximum relative change allowed per step"
                }),
            }
        }
    
    RETURN_TYPES = ("SAMPLER",)
    FUNCTION = "get_sampler"
    CATEGORY = "sampling/custom_sampling/samplers"
    DESCRIPTION = "Minimal Change Flow sampler - limits change per step to prevent drift"
    
    def get_sampler(self, max_change_per_step):
        sampler = comfy.samplers.KSAMPLER(
            lambda model, x, sigmas, **kwargs: sample_minimal_change_flow(
                model, x, sigmas,
                max_change_per_step=max_change_per_step,
                **kwargs
            )
        )
        return (sampler,)


NODE_CLASS_MAPPINGS = {
    "SamplerMinimalChangeFlow": SamplerMinimalChangeFlow,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SamplerMinimalChangeFlow": "Minimal Change Flow",
}
