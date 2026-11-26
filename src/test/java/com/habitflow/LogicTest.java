package com.habitflow;

import com.habitflow.controller.logic.*;
import com.habitflow.model.*;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class LogicTest {

    @Test
    void strengthGrowsWithConsistencyAndSurvivesOneMiss() {
        List<Double> perfect = new ArrayList<>(Collections.nCopies(60, 1.0));
        int strong = StrengthScore.compute(perfect);
        assertTrue(strong > 95, "60 perfect days should be > 95, was " + strong);
        perfect.add(0.0);
        int afterMiss = StrengthScore.compute(perfect);
        assertTrue(strong - afterMiss < 7, "one miss should cost only a few points");
        assertEquals(0, StrengthScore.compute(List.of()));
        assertEquals(50, StrengthScore.compute(Collections.nCopies(13, 1.0)), "half-life of 13 periods");
    }

    @Test
    void pearsonMatchesKnownValues() {
        assertEquals(1.0, Correlation.pearson(new double[]{1, 2, 3, 4}, new double[]{2, 4, 6, 8}), 1e-12);
        assertEquals(-1.0, Correlation.pearson(new double[]{1, 2, 3}, new double[]{3, 2, 1}), 1e-12);
        // reference value computed by hand: x={1,2,3,4,5}, y={2,1,4,3,5} -> 0.8
        assertEquals(0.8, Correlation.pearson(new double[]{1, 2, 3, 4, 5}, new double[]{2, 1, 4, 3, 5}), 1e-12);
        assertTrue(Double.isNaN(Correlation.pearson(new double[]{1, 1, 1}, new double[]{1, 2, 3})));
        assertTrue(Double.isNaN(Correlation.pearson(new double[]{1, 2}, new double[]{1, 2})));
    }

    @Test
    void passwordHashIsSaltedAndVerifies() {
        String salt = PasswordHasher.newSalt();
        String hash = PasswordHasher.hash("s3cretPass", salt);
        assertTrue(PasswordHasher.verify("s3cretPass", salt, hash));
        assertFalse(PasswordHasher.verify("s3cretPasS", salt, hash));
        assertNotEquals(hash, PasswordHasher.hash("s3cretPass", PasswordHasher.newSalt()), "same password, different salt");
    }

    @Test
    void coinRewardScalesWithStreakAndDoubles() {
        assertEquals(10, CoinCalculator.reward(0, false));
        assertEquals(15, CoinCalculator.reward(15, false));
        assertEquals(20, CoinCalculator.reward(30, false));
        assertEquals(20, CoinCalculator.reward(500, false), "multiplier caps at 2x");
        assertEquals(40, CoinCalculator.reward(30, true));
    }

    @Test
    void habitSubclassesInterpretValuesDifferently() {
        Habit yes = HabitType.BOOLEAN.newHabit();
        Habit count = HabitType.COUNT.newHabit();
        count.setTarget(8);
        count.setUnit("glasses");
        Habit time = HabitType.DURATION.newHabit();
        time.setTarget(30);

        assertTrue(yes.isCompleted(1));
        assertFalse(count.isCompleted(7));
        assertTrue(count.isCompleted(8));
        assertEquals("5 / 8 glasses", count.formatValue(5));
        assertEquals("1h 05m / 30m", time.formatValue(65));
        assertEquals(0.5, time.progress(15), 1e-9);
        assertThrows(IllegalArgumentException.class, () -> count.setTarget(0));
        assertThrows(IllegalArgumentException.class, () -> yes.setName("  "));
        assertThrows(IllegalArgumentException.class, () -> yes.setColor("red"));
    }
}
