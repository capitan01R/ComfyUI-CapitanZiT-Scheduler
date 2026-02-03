"""
Smooth Cosine Scheduler
========================
A smooth, cosine-based sigma scheduler for flow matching models.
Provides gentle transitions with no sudden changes.
"""

import torch
import math


class FlowMatchSchedulerSmoothCosine:
    """
    Smooth cosine-based scheduler for flow matching models.
    
    Uses a cosine interpolation to create a sigma schedule that:
    - Starts very slow (preserves initial state)
    - Smoothly accelerates through the middle
    - Gently finishes at the end
    
    This schedule avoids sudden jumps and provides very stable sampling.
    """
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "steps": ("INT", {
                    "default": 8,
                    "min": 4,
                    "max": 100,
                    "tooltip": "Number of sampling steps"
                }),
                "denoise": ("FLOAT", {
                    "default": 1.00,
                    "min": 0.0,
                    "max": 1.0,
                    "step": 0.01,
                    "tooltip": "Denoising strength (1.0 = full denoise)"
                }),
            }
        }
    
    RETURN_TYPES = ("MODEL", "SIGMAS")
    FUNCTION = "get_sigmas"
    CATEGORY = "sampling/custom_sampling/schedulers"
    DESCRIPTION = "Smooth cosine schedule - gentle transitions, no sudden changes"
    
    def get_sigmas(self, model, steps, denoise):
        """
        Generate smooth cosine sigma schedule.
        
        Args:
            model: The model (passed through)
            steps: Number of sampling steps
            denoise: Denoising strength (0.0 to 1.0)
        
        Returns:
            Tuple of (model, sigmas)
        """
        # Generate normalized time steps
        t = torch.linspace(0, 1, steps)
        
        # Apply cosine interpolation for smooth transitions
        # Formula: (1 + cos(t * π)) / 2 gives smooth S-curve from 1 to 0
        sigmas = denoise * (1.0 + torch.cos(t * math.pi)) / 2.0
        
        # Append final zero sigma
        sigmas = torch.cat([sigmas, torch.zeros(1)])
        
        return (model, sigmas)


NODE_CLASS_MAPPINGS = {
    "FlowMatchSchedulerSmoothCosine": FlowMatchSchedulerSmoothCosine,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "FlowMatchSchedulerSmoothCosine": "Flow Scheduler (Smooth Cosine)",
}
