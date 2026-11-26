package com.habitflow.model;

import java.time.LocalDateTime;

/** One entry of the coin ledger: how many coins changed and why. */
public record CoinTransaction(int delta, String reason, LocalDateTime time) { }
