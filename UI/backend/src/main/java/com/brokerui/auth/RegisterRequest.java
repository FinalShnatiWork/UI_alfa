package com.brokerui.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
    @NotBlank @Email String email,
    @NotBlank @Size(max = 160) String displayName,
    @NotBlank @Size(min = 8, max = 72) String password) {}
