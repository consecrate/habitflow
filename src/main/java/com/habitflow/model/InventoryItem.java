package com.habitflow.model;

/** How many of one power-up the user owns. */
public record InventoryItem(PowerUp powerUp, int quantity) { }
