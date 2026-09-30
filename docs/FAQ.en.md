# Campaign FAQ: War on the Vespator Front

German version: [FAQ.md](FAQ.md)

This FAQ settles rules questions about the campaign "War on the Vespator Front" (*500 Worlds: Titus*) that the rulebook does not answer clearly. Each question lists the rules reference, background and our decision. The app implements exactly these decisions; the Warmaster may deviate in individual cases.

- **Official clarifications:** Games Workshop has not yet published an FAQ or errata for the campaign (as of 28.09.2026).
- **Edition:** Since 01.06.2026 the 11th edition of Warhammer 40,000 applies; there is no official update of the campaign yet. The campaign mechanics (map, Power Level, operations) are edition-independent; the group adapts the mission rules as needed (see F-24).

Classification legend:
- **Rules text**: The rulebook is unambiguous; the FAQ only confirms our reading.
- **Interpretation**: The wording leaves room; we follow the most obvious reading.
- **House rule**: The rulebook is silent or we deliberately deviate.

---

## A. Sequence and Operations

### F-1 Which value determines the build order in step 5 "Build Infrastructure"?
- **Rules reference:** Step 5 ranks the Alliances by the sum of their Power Levels on the whole map; ties are decided by a roll-off.
- **Background:**
  - Goonhammer paraphrases the rule as an order by score. That paraphrases the rule without interpreting it.
- **Decision (Rules text):** What counts is the **sum of Power Levels without the Stronghold bonus (+3)**. The wording explicitly names the Power Levels, not the campaign points. Ties are settled by a roll-off.

### F-2 Which value determines the order for "Lull in the Fighting" and "Tides of War"?
- **Rules reference:** Both events start with the Alliance that leads on the Points Tracker.
- **Background:**
  - ratflavored.com renders the rule as "highest Point Total".
- **Decision (Rules text):** **Campaign points**, i.e. the Power Level sum plus 3 for an intact Stronghold. Ties are settled by a roll-off.

### F-3 Does a Boarding Action require an enemy fleet at the target Planet?
- **Rules reference:** The Boarding Action is aimed at an enemy fleet that sits in orbit above the Planet. The requirements of the Battle Operation (target Planet, enemy Alliance) do not explicitly demand this, however.
- **Decision (Interpretation):** **Allowed, with a warning.** If no enemy fleet is there when the result is processed, an attacker victory drives nothing off, but the +1 PL still applies.

### F-4 May a Void Leap target a destroyed Planet?
- **Rules reference:** No Campaign Operation may target a destroyed Planet. Fleets may still move there, however.
- **Background:**
  - ratflavored.com reads it the same way: moving to a destroyed Planet is allowed, choosing it for an operation is not.
- **Decision (Rules text):** **No.** A destroyed Planet cannot be selected for any operation, not even Void Leap. Fleets may move there with Move Fleets (step 4).

### F-5 Defiant Zeal: May the additional operation be the same as the first?
- **Rules reference:** Every fleet of the Alliance that is behind may pick one extra Campaign Operation.
- **Background:**
  - Goonhammer only calls it "a bonus Campaign Operation".
- **Decision (Interpretation):** **Yes**, any operation is allowed, including the same one twice, e.g. two Battle Operations. The targets of both operations are determined from the fleet's **current** Planet, even if one of them is a Void Leap, because the arrival only happens in stage 2.5.

### F-6 Which default operation does a fleet without orders get when Logistical Auxilia is forbidden?
- **Rules reference:** Without orders, Logistical Auxilia applies. Sinister Omens forbids Logistical Auxilia in the next phase.
- **Background:**
  - Goonhammer only confirms Logistical Auxilia as the default.
- **Decision (House rule):** The fleet has **no operation** in that phase. The same applies if Logistical Auxilia is disabled via a campaign switch.

### F-7 What happens to Raise Edifices if the Alliance is already at the limit for that Infrastructure type?
- **Rules reference:** The rulebook only cancels Raise Edifices if the Planet has no free location left. The per-Alliance limits apply to every build in general.
- **Background:**
  - Goonhammer only mentions the case of full locations.
- **Decision (Interpretation):** The operation is **cancelled** in stage 2.2. The app already warns when the order is entered.

### F-8 How are multiplayer battles (2v2, 1v2) scored?
- **Rules reference:** The rulebook provides for one game per Battle Operation and says nothing about multiplayer battles.
- **Background:**
  - Drawbridge Games (store campaign) uses a house rule: one fleet action can be represented by several games whose results are added up.
- **Decision (House rule):**
  - Several Battle Operations with the **same Planet, same Alliances and same Attack Type** can be bundled into **one** battle.
  - The result applies to each bundled operation individually. Two operations therefore yield two Campaign Outcomes.

### F-9 What happens to Battle Operations that were not played by the end of the battle phase?
- **Rules reference:** At the end of stage 2.3 the attacking fleet counts as the winner.
- **Background:**
  - Frontline Gaming generally recommends short rounds; unfinished battles are resolved via the campaign system.
  - Goonhammer points out the unevenly distributed game load and advises guidelines set by the Warmaster.
- **Decision (Rules text + House rule):** The default is **"attacker wins"**. The Warmaster can instead choose "defender wins", "void" or "postpone to the next phase". The reason is logged.

---

## B. Campaign Outcomes

### F-10 Seize Power Base (attacker wins): What if the attacker is at the limit for the captured type?
- **Rules reference:** The defender's piece is removed, and the attacker puts up a piece of the same type in the same spot. The per-Alliance limits apply in general.
- **Decision (Interpretation):** The defender's piece is **removed anyway**. The attacker builds nothing; the slot becomes free.

### F-11 Seize Power Base (defender wins, PL ≥ 3): May the Staging Grounds also be built on a connected Planet?
- **Rules reference:** The Fortification Line may go on this Planet or on a connected one; at PL ≥ 3 the defender may build Staging Grounds in its place.
- **Decision (Interpretation):** **Yes.** "Instead" only replaces the type; the choice of location stays the same.

### F-12 Purge and Burn (defender wins): Does destroying a Fortification Line count as "subtract 1" for the redistribution?
- **Rules reference:**
  - The defender may lower their PL here by 1 any number of times, gaining +1 on a connected Planet each time.
  - A Fortification Line is destroyed when a rule would lower the PL below its minimum.
- **Decision (Interpretation):** **Yes.** The reduction takes place as the rules say; the Line absorbs it. If no further reduction is possible (PL 1, no Line), no further redistribution is allowed.

### F-13 May a Stronghold relocate with Orbital Invasion (defender wins) or Smuggled Assets?
- **Rules reference:** Orbital Invasion lets the defender relocate as many of its Infrastructure pieces as it likes; Smuggled Assets applies to every single piece. Neither names an exception. The additional builds, by contrast, explicitly exclude the Stronghold.
- **Decision (Interpretation):** **Yes**, the Stronghold may relocate too, because where Strongholds are excluded, the rulebook says so explicitly. The Stronghold still counts as intact afterwards.

### F-14 Are Campaign Outcomes calculated with the Power Level at the time of the battle or at the time of processing?
- **Rules reference:** Results are processed chronologically in stage 2.4. A Power Level that has changed in the meantime leaves the chosen Campaign Outcome as it is. Decisions that have become invalid are made anew by the winner.
- **Decision (Interpretation):**
  - The **winner's decisions** remain valid, e.g. which piece is taken over.
  - Thresholds such as "PL ≥ 3" and comparisons are checked against the values **at the time of processing**.
  - If a decision can no longer be carried out, the app asks for a new choice.

---

## C. Power Level and Infrastructure

### F-15 "Treat Power Level as 1 higher or lower": May the value go below 1 or above 4? Do Stronghold and Coordinated Opposition stack?
- **Rules reference:**
  - Stronghold (for Campaign Outcomes), Staging Grounds (for Mission Rules, explicitly not cumulative) and Coordinated Opposition (for both) each allow ±1.
  - The rulebook names no cap for this effect.
- **Decision (Interpretation):**
  - The treated value only serves for comparisons and thresholds and is **not capped at 1 to 4**. The actual PL does not change.
  - Multiple sources **do not stack**: at most ±1 per purpose (Mission Rules or Outcomes).

### F-16 Are multiple Fortification Lines on the same Planet cumulative?
- **Rules reference:** Each Line raises its Alliance's minimum Power Level on that Planet by 1; the rule is worded per piece.
- **Background:**
  - The rules summary on [ratflavored.com](https://ratflavored.com/) says, in effect, that one of the Lines on the Planet is destroyed in that case. That presupposes several Lines per Planet.
- **Decision (Interpretation):** **Cumulative**: minimum = 1 + number of own Lines, at most 4. A reduction below the minimum destroys exactly one Line.

### F-17 Can a Power Level rise above 4 (Penumbral Wreath +2, Archeotech Riches)?
- **Rules reference:** The PL lies between 1 and 4 unless a rule explicitly says otherwise. The Penumbral Wreath raises it by two without explicitly lifting the limit.
- **Background:**
  - The Warhammer Community article of 09.01.2026 also gives the range 1 to 4 with the same exception for explicit rules.
- **Decision (Interpretation):** **No, at most 4.** None of the rules explicitly says that the limit does not apply. Only a destroyed Planet has PL 0.

### F-18 What does the Support Facility (Planets two steps away count as connected) apply to?
- **Rules reference:** For players of the Alliance, Planets at distance 2 count as connected; the reverse direction does not apply. The example picture shows a fleet move.
- **Background:**
  - ratflavored.com and Goonhammer both describe the extra connection without limiting it to movement.
- **Decision (Interpretation):** The Support Facility applies to **all rules that use "connected"**: attack targets, Kill Teams, fleet movement, building in step 5, Logistical Auxilia, the range of Stronghold and Staging Grounds, and Outcome options. The connection is **directional**, starting from the Facility's Planet. Void Piracy switches the effect off for one phase.
- **House rule alternative (fleet movement only):** This includes the moves from the Boarding Action outcome (target fleet up to twice, or own fleet once). The rules handle them like moves in the Move Fleets step, so the Support Facility applies there as well.

### F-19 How many rolls are made for the Power Level in Cult Uprisings?
- **Rules reference:** After the Infrastructure rolls, the dominating Alliance rolls a D6 for each level of its Power Level on the Planet.
- **Background:**
  - Goonhammer and ratflavored.com consistently render the rule as one D6 per Power Level, −1 with an own fleet present.
- **Decision (Rules text):** The number of rolls equals the PL **before** these rolls, after the Infrastructure step. If the Planet is destroyed in the process, the PL rolls are dropped.

---

## D. Events and Medals

### F-20 Archeotech Riches: Are destroyed Planets candidates? Who gets the Riches in case of a tie?
- **Rules reference:**
  - Candidates are the three Planets whose summed Power Levels are smallest.
  - The Alliance with the most battle victories there wins.
- **Background:**
  - ratflavored.com documents the event, but not how it was resolved.
- **Decision (House rule):**
  - Destroyed Planets (sum 0) are **not candidates**; they cannot be attacked.
  - In case of a tie at the cut-off, the Warmaster chooses or lots are drawn.
  - If the number of wins is tied, **nobody secures** the Riches.

### F-21 Machinations of Fate: Do the fleets switch Alliance together with the player?
- **Rules reference:** The Warmaster assigns the players so that every player gets one or more fleets of the Alliance they prefer. Unclaimed fleets go to the remaining players.
- **Background:**
  - ratflavored.com renders the rule the same way (fleets stay with the Alliance).
  - Goonhammer calls the event its least favourite.
- **Decision (Rules text):** **No**, the fleets stay with their Alliance. The defector is assigned a fleet of the new Alliance; the fleet counts do not change. The new allegiance applies from the next phase.

### F-22 How are ties for the Campaign Medals resolved if the number of other Campaign Medals is also equal?
- **Rules reference:** On a tie, the Alliance holding fewer other medals goes first. The rulebook names no further tiebreaker.
- **Decision (House rule):** The medals are awarded in the order Laurel, Wreath, Star, Dagger. If it is still tied, a **roll-off** decides.

### F-23 What happens if an Alliance has more than 55 points?
- **Rules reference:** The map's Points Tracker runs from 1 to 55.
- **Background:**
  - In the campaign documented by ratflavored.com, the final score was 41/36/33.
- **Decision (House rule):** Points above 55 are possible. The app keeps counting normally and marks the value on the tracker as "55+".

---

## E. General

### F-24 Which missions are played, and what applies in the 11th edition?
- **Rules reference:** Each Attack Type has its own mission. With both players' consent, a mission from another publication may be played; the Campaign Outcome is always determined by the operation.
- **Background:**
  - Goonhammer criticises that the missions quickly become repetitive.
  - Frontline Gaming uses a house rule letting the attacker choose between campaign and Pariah Nexus missions, suggests not playing the same mission twice in a row, and treats missions more as a suggestion.
- **Decision (Rules text + Recommendation):**
  - The app allows "Vespator mission" or "external mission" with a name for each battle.
  - The campaign consequences depend only on the Attack Type and the result.
  - For the 11th edition we recommend adopting the mission rules in spirit and recording deviations in the campaign's Dispatch.

### F-25 Where is it defined what applies differently in our campaign?
In the **campaign rules of the reader view** ("Rules"). That page lists the active and disabled parts of the rules (events, Theatres, medals, individual operations) and this FAQ. The action log records individual decisions of the Warmaster (overrides) with their reason.

### F-26 How tight is the "fog over the scores"?
- **Rules reference:** none; the fog is a house rule (C1). The rules assume an open Points Tracker.
- **Background:** The reader view shows only rank and tendency instead of points; the points history, point bonuses and the final scoring are hidden. The map stays public, though: anyone who adds up all Power Levels and adds 3 for every intact Stronghold can work out the Campaign points.
- **Decision (House rule):** The fog only hides the numbers from a quick glance. Keeping the points secret would mean hiding the map as well, and the app does not do that on purpose.

---

## Sources

**Games Workshop:**
- Warhammer Community: "500 Worlds: Titus – Will you brave a deadly campaign on the war-torn Vespator Front?", 09.01.2026, https://www.warhammer-community.com/en-gb/articles/oq2wdapz/500-worlds-titus-will-you-brave-a-deadly-campaign-on-the-war-torn-vespator-front/

**Community:**
- Goonhammer: "Goonhammer Reviews 500 Worlds: War on the Vespator Front Campaign", 10.01.2026, https://www.goonhammer.com/goonhammer-reviews-500-worlds-war-on-the-vespator-front-campaign/
- ratflavored.com: "500 Worlds – Campaign Completed" (rules summary and campaign log), https://ratflavored.com/
- Red Ones Go Faster / Drawbridge Games: "500 Worlds at Drawbridge – Spring Store Campaign", 14.01.2026, https://red-ones-go-faster.com/2026/01/14/500-worlds-at-drawbridge-spring-store-campaign/
- Frontline Gaming: "500 Worlds Campaign System Review and 11th Adaptations", 14.07.2026, https://frontlinegaming.org/2026/07/14/500-worlds-campaign-system-review-and-11th-adaptaions/
- Frontline Gaming: "Lessons Learned From a 60-Game Campaign", 27.07.2026, https://frontlinegaming.org/2026/07/27/lessons-learned-from-a-60-game-campaign/
- Frontline Gaming: "500 Worlds Titus Vespator Front Campaign Guide", 09.01.2026, https://frontlinegaming.org/2026/01/09/500-worlds-titus-vespator-front-campaign-guide-map-wars-alliances-and-planet-twists/
