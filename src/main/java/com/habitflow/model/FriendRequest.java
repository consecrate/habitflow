package com.habitflow.model;

import java.time.LocalDateTime;

/** A pending or accepted connection to another user. */
public record FriendRequest(int fromUserId, String username, String displayName, LocalDateTime sentAt) { }
