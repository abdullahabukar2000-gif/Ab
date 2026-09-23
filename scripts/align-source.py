# Meaning groups for verse by verse: each group of Arabic words (by the index
# of its last word) and the piece(s) of The Clear Quran translation it means.
# Pieces are exact substrings of the published translation, never edited.
# Run `python3 scripts/align-source.py` to check every ayah (groups cover all
# words in order; pieces rebuild the translation exactly) and write
# data/align/clear-quran.json. It stops and lists problems instead of writing.
A = {
"13:43": [(2,"The disbelievers say,"),(4,"“You ˹Muḥammad˺ are no messenger.”"),(5,"Say, ˹O Prophet,˺"),(8,"“Allah is sufficient as a Witness"),(10,"between me and you,"),(14,"as is whoever has knowledge of the Scripture.”")],
"14:1": [(0,"Alif-Lãm-Ra."),(3,"˹This is˺ a Book which We have revealed to you ˹O Prophet˺"),(9,"so that you may lead people out of darkness and into light,"),(11,"by the Will of their Lord,"),(15,"to the Path of the Almighty, the Praiseworthy—")],
"14:2": [(2,"Allah, to Whom belongs"),(5,"whatever is in the heavens"),(8,"and whatever is on the earth."),(10,"And woe to the disbelievers"),(13,"because of a severe torment")],
"14:3": [(3,"˹They are˺ the ones who favour the life of this world"),(5,"over the Hereafter"),(9,"and hinder ˹others˺ from the Way of Allah,"),(11,"striving to make it ˹appear˺ crooked."),(15,"It is they who have gone far astray")],
"14:4": [(3,"We have not sent a messenger"),(6,"except in the language of his people"),(8,"to clarify ˹the message˺ for them."),(12,"Then Allah leaves whoever He wills to stray"),(15,"and guides whoever He wills."),(18,"And He is the Almighty, All-Wise")],
"14:5": [(3,"Indeed, We sent Moses with Our signs,"),(6,"˹ordering him,˺ “Lead your people"),(10,"out of darkness and into light,"),(13,"and remind them of Allah’s days ˹of favour˺.”"),(17,"Surely in this are signs"),(20,"for whoever is steadfast, grateful")],
"14:6": [(3,"˹Consider˺ when Moses said to his people,"),(7,"“Remember Allah’s favour upon you"),(12,"when He rescued you from the people of Pharaoh,"),(15,"who afflicted you with dreadful torment—"),(17,"slaughtering your sons"),(19,"and keeping your women."),(25,"That was a severe test from your Lord")],
"14:7": [(2,"And ˹remember˺ when your Lord proclaimed,"),(4,"‘If you are grateful,"),(5,"I will certainly give you more."),(7,"But if you are ungrateful,"),(10,"surely My punishment is severe.’”")],
"14:8": [(1,"Moses added,"),(8,"“If you along with everyone on earth were to be ungrateful,"),(12,"then ˹know that˺ Allah is indeed Self-Sufficient, Praiseworthy.”")],
"14:9": [(2,"Have you not ˹already˺ received the stories"),(5,"of those who were before you:"),(9,"the people of Noah, ’Âd, Thamûd,"),(12,"and those after them?"),(16,"Only Allah knows how many they were."),(19,"Their messengers came to them with clear proofs,"),(23,"but they put their hands over their mouths"),(26,"and said, “We totally reject"),(29,"what you have been sent with,"),(36,"and we are certainly in alarming doubt about what you are inviting us to.”")],
"14:10": [(1,"Their messengers asked ˹them˺,"),(4,"“Is there any doubt about Allah,"),(7,"the Originator of the heavens and the earth?"),(12,"He is inviting you in order to forgive your sins,"),(16,"and delay your end until your appointed term.”"),(17,"They argued,"),(22,"“You are no more than humans like us!"),(25,"You ˹only˺ wish to turn us away"),(29,"from what our forefathers worshipped."),(32,"So bring us some compelling proof.”")],
"14:11": [(2,"Their messengers said to them,"),(7,"“We are ˹indeed˺ only humans like you,"),(10,"but Allah favours"),(15,"whoever He chooses of His servants."),(21,"It is not for us to bring you any proof"),(24,"without Allah’s permission."),(28,"And in Allah let the believers put their trust")],
"14:12": [(5,"Why should we not put our trust in Allah,"),(8,"when He has truly guided us to ˹the very best of˺ ways?"),(12,"Indeed, we will patiently endure whatever harm you may cause us."),(16,"And in Allah let the faithful put their trust.”")],
"14:13": [(3,"The disbelievers then threatened their messengers,"),(6,"“We will certainly expel you from our land,"),(10,"unless you return to our faith.”"),(13,"So their Lord revealed to them,"),(15,"“We will surely destroy the wrongdoers")],
"14:14": [(1,"and make you reside in the land"),(3,"after them."),(7,"This is for whoever is in awe of standing before Me"),(9,"and fears My warning.”")],
"14:15": [(0,"And both sides called for judgment,"),(4,"so every stubborn tyrant was doomed")],
"14:16": [(2,"Awaiting them is Hell,"),(6,"and they will be left to drink oozing pus")],
"14:17": [(0,"which they will sip with difficulty,"),(3,"and can hardly swallow."),(5,"Death will overwhelm them"),(8,"from every side,"),(11,"yet they will not ˹be able to˺ die."),(15,"Awaiting them still is harsher torment")],
"14:18": [(4,"The parable of the deeds of those who disbelieve in their Lord"),(8,"is that of ashes fiercely blown away by wind"),(11,"on a stormy day."),(17,"They will gain nothing from what they have earned."),(21,"That is ˹truly˺ the farthest one can stray")],
"14:19": [(1,"Have you not seen"),(6,"that Allah created the heavens and the earth"),(7,"for a reason?"),(10,"If He wills, He can eliminate you"),(13,"and produce a new creation")],
"14:20": [(4,"And that is not difficult for Allah ˹at all˺")],
"14:21": [(2,"They will all appear before Allah,"),(6,"and the lowly ˹followers˺ will appeal to the arrogant ˹leaders˺,"),(10,"“We were your ˹dedicated˺ followers,"),(14,"so will you ˹then˺ protect us"),(17,"from Allah’s torment"),(19,"in any way?”"),(20,"They will reply,"),(23,"“Had Allah guided us,"),(24,"we would have guided you."),(26,"˹Now˺ it is all the same for us"),(29,"whether we suffer patiently or impatiently,"),(33,"there is no escape for us.”")],
"14:22": [(1,"And Satan will say ˹to his followers˺"),(4,"after the judgment has been passed,"),(9,"“Indeed, Allah has made you a true promise."),(10,"I too made you a promise,"),(11,"but I failed you."),(17,"I did not have any authority over you."),(20,"I only called you,"),(22,"and you responded to me."),(24,"So do not blame me;"),(26,"blame yourselves."),(29,"I cannot save you,"),(32,"nor can you save me."),(34,"Indeed, I denounce"),(38,"your previous association of me with Allah ˹in loyalty˺."),(43,"Surely the wrongdoers will suffer a painful punishment.”")],
"14:23": [(5,"Those who believe and do good will be admitted into Gardens,"),(9,"under which rivers flow—"),(11,"to stay there forever"),(13,"by the Will of their Lord—"),(16,"where they will be greeted with “Peace!”")],
"14:24": [(1,"Do you not see"),(5,"how Allah compares"),(7,"a good word"),(9,"to a good tree?"),(11,"Its root is firm"),(14,"and its branches reach the sky")],
"14:25": [(1,"˹always˺ yielding its fruit"),(3,"in every season"),(5,"by the Will of its Lord."),(9,"This is how Allah sets forth parables for the people,"),(11,"so perhaps they will be mindful")],
"14:26": [(2,"And the parable of an evil word"),(4,"is that of an evil tree,"),(8,"uprooted from the earth,"),(12,"having no stability")],
"14:27": [(3,"Allah makes the believers steadfast"),(5,"with the firm Word ˹of faith˺"),(8,"in this worldly life"),(10,"and the Hereafter."),(13,"And Allah leaves the wrongdoers to stray."),(17,"For Allah does what He wills")],
"14:28": [(1,"Have you not seen"),(3,"those ˹disbelievers˺"),(7,"who meet Allah’s favours with ingratitude"),(9,"and lead their own people"),(11,"to their doom")],
"14:29": [(1,"In Hell they will burn."),(3,"What an evil place for settlement")],
"14:30": [(2,"They set up equals to Allah"),(5,"to mislead ˹others˺ from His Way."),(6,"Say, ˹O Prophet,˺"),(7,"“Enjoy yourselves!"),(11,"Surely your destination is the Fire.”")],
"14:31": [(3,"Tell My believing servants"),(5,"to establish prayer"),(8,"and donate from what We have provided for them—"),(10,"openly and secretly—"),(15,"before the arrival of a Day"),(20,"in which there will be no ransom or friendly connections")],
"14:32": [(4,"It is Allah Who created the heavens and the earth"),(8,"and sends down rain from the sky,"),(14,"causing fruits to grow as a provision for you."),(17,"He has subjected the ships for your service,"),(21,"sailing through the sea by His command,"),(24,"and has subjected the rivers for you")],
"14:33": [(3,"He has ˹also˺ subjected for you the sun and the moon,"),(4,"both constantly orbiting,"),(8,"and has subjected the day and night for you")],
"14:34": [(4,"And He has granted you all that you asked Him for."),(8,"If you tried to count Allah’s blessings,"),(10,"you would never be able to number them."),(12,"Indeed humankind"),(14,"is truly unfair, ˹totally˺ ungrateful")],
"14:35": [(2,"˹Remember˺ when Abraham prayed,"),(3,"“My Lord!"),(7,"Make this city ˹of Mecca˺ secure,"),(9,"and keep me and my children away"),(12,"from the worship of idols")],
"14:36": [(0,"My Lord!"),(5,"They have caused many people to go astray."),(9,"So whoever follows me is with me,"),(11,"and whoever disobeys me—"),(14,"then surely You are ˹still˺ All-Forgiving, Most Merciful")],
"14:37": [(0,"Our Lord!"),(4,"I have settled some of my offspring"),(8,"in a barren valley,"),(11,"near Your Sacred House,"),(12,"our Lord,"),(14,"so that they may establish prayer."),(18,"So make the hearts of ˹believing˺ people"),(20,"incline towards them"),(23,"and provide them with fruits,"),(25,"so perhaps they will be thankful")],
"14:38": [(0,"Our Lord!"),(4,"You certainly know what we conceal"),(6,"and what we reveal."),(12,["Nothing","is hidden from Allah"]),(17,"on earth or in heaven")],
"14:39": [(1,"All praise is for Allah"),(4,"who has blessed me"),(6,"in my old age."),(8,"with Ishmael and Isaac"),(12,"My Lord is indeed the Hearer of ˹all˺ prayers")],
"14:40": [(0,"My Lord!"),(5,"Make me and those ˹believers˺ of my descendants keep up prayer."),(6,"Our Lord!"),(8,"Accept my prayers")],
"14:41": [(0,"Our Lord!"),(4,"Forgive me, my parents, and the believers"),(7,"on the Day when the judgment will come to pass.”")],
"14:42": [(3,"Do not think ˹O Prophet˺ that Allah is unaware"),(6,"of what the wrongdoers do."),(9,"He only delays them until a Day"),(12,"when ˹their˺ eyes will stare in horror—")],
"14:43": [(0,"rushing forth,"),(2,"heads raised,"),(6,"never blinking,"),(8,"hearts void")],
"14:44": [(1,"And warn the people"),(4,"of the Day when the punishment will overtake ˹the wicked among˺ them,"),(7,"and the wrongdoers will cry,"),(8,"“Our Lord!"),(12,"Delay us for a little while."),(14,"We will respond to Your call"),(16,"and follow the messengers!”"),(21,"˹It will be said,˺ “Did you not swear before"),(25,"that you would never be removed ˹to the next life˺?”")],
"14:45": [(2,"You passed by the ruins"),(5,"of those ˹destroyed peoples˺ who had wronged themselves."),(7,"It was made clear to you"),(10,"how We dealt with them,"),(13,"and We gave you ˹many˺ examples")],
"14:46": [(2,"They devised every plot,"),(5,"which was fully known to Allah,"),(8,"but their plotting was not enough"),(11,"to ˹even˺ overpower mountains ˹let alone Allah˺")],
"14:47": [(2,"So do not think ˹O Prophet˺ that Allah"),(5,"will fail to keep His promise to His messengers."),(8,"Allah is indeed Almighty,"),(10,"capable of punishment")],
"14:48": [(4,"˹Watch for˺ the Day ˹when˺ the earth will be changed into a different earth"),(5,"and the heavens as well,"),(7,"and all will appear before Allah—"),(9,"the One, the Supreme")],
"14:49": [(2,"On that Day you will see the wicked"),(5,"bound together in chains")],
"14:50": [(2,"with garments of tar,"),(5,"and their faces covered with flames")],
"14:51": [(3,"As such, Allah will reward every soul"),(5,"for what it has committed."),(9,"Surely Allah is swift in reckoning")],
"14:52": [(2,"This ˹Quran˺ is a ˹sufficient˺ message for humanity"),(4,"so that they may take it as a warning"),(9,"and know that there is only One God,"),(12,"and so that people of reason may be mindful")],
"15:1": [(0,"Alif-Lãm-Ra."),(3,"These are the verses of the Book;"),(5,"the clear Quran")],
"15:2": [(3,"˹The day will come when˺ the disbelievers will certainly wish"),(6,"they had submitted ˹to Allah˺")],
"15:3": [(2,"˹So˺ let them eat and enjoy themselves"),(4,"and be diverted by ˹false˺ hope,"),(6,"for they will soon know")],
"15:4": [(3,"We have never destroyed a society"),(7,"without a destined term")],
"15:5": [(4,"No people can advance their doom,"),(6,"nor can they delay it")],
"15:6": [(0,"They say,"),(5,"“O you to whom the Reminder is revealed!"),(7,"You must be insane")],
"15:7": [(3,"Why do you not bring us the angels,"),(7,"if what you say is true?”")],
"15:8": [(2,"We do not send the angels down"),(4,"except for a just cause,"),(8,"and then ˹the end of˺ the disbelievers will not be delayed")],
"15:9": [(3,"It is certainly We Who have revealed the Reminder,"),(6,"and it is certainly We Who will preserve it")],
"15:10": [(3,"Indeed, We sent messengers before you ˹O Prophet˺"),(6,"among the groups of early peoples")],
"15:11": [(3,"but no messenger ever came to them"),(7,"without being mocked")],
"15:12": [(1,"This is how We allow disbelief ˹to steep˺"),(4,"into the hearts of the wicked")],
"15:13": [(2,"They would not believe in this ˹Quran˺"),(6,"despite the ˹many˺ examples of those ˹destroyed˺ before")],
"15:14": [(5,"And even if We opened for them a gate to heaven,"),(8,"through which they continued to ascend")],
"15:15": [(0,"still they would say,"),(3,"“Our eyes have truly been dazzled!"),(7,"In fact, we must have been bewitched.”")],
}

import json, glob, sys, os
ROOT = os.path.join(os.path.dirname(__file__), '..')
counts = {}
for f in glob.glob(os.path.join(ROOT, 'data/pages/*.json')):
    for l in json.load(open(f))['lines']:
        for w in l['words']:
            if w['type'] == 'word': counts[w['verseKey']] = max(counts.get(w['verseKey'], 0), w['pos'])
tr = {}
for f in glob.glob(os.path.join(ROOT, 'data/translations/clear-quran/*.json')): tr.update(json.load(open(f))['verses'])

problems, out = [], {}
for key in counts:
    if key not in A: problems.append(f'{key}: no groups'); continue
for key, groups in A.items():
    text, n = tr[key], counts[key]
    ends = [g[0] for g in groups]
    if ends != sorted(set(ends)) or ends[-1] != n - 1:
        problems.append(f'{key}: group ends {ends} do not cover words 0..{n-1}'); continue
    used, placed = [], []
    for gi, (_, pieces) in enumerate(groups):
        for piece in ([pieces] if isinstance(pieces, str) else pieces):
            at, found = 0, None
            while (i := text.find(piece, at)) != -1:
                if all(i + len(piece) <= s or i >= e for s, e in used): found = i; break
                at = i + 1
            if found is None: problems.append(f'{key}: piece not found: {piece!r}'); continue
            used.append((found, found + len(piece))); placed.append((found, found + len(piece), gi))
    placed.sort()
    pos = 0
    for s, e, _ in placed:
        if text[pos:s].strip(): problems.append(f'{key}: uncovered text {text[pos:s]!r}')
        pos = e
    if text[pos:].strip(): problems.append(f'{key}: uncovered text at end {text[pos:]!r}')
    out[key] = {'ends': ends, 'pieces': [[s, e, gi] for s, e, gi in placed]}

if problems:
    print('\n'.join(problems)); sys.exit(1)
json.dump({'translation': 'The Clear Quran, Dr. Mustafa Khattab', 'note': 'Arabic meaning groups (index of each group\'s last word) and the character ranges of the translation each group means. Generated by scripts/align-source.py.', 'verses': out},
          open(os.path.join(ROOT, 'data/align/clear-quran.json'), 'w'), ensure_ascii=False, indent=0)
print(f'ok: {len(out)} ayahs, {sum(len(v["ends"]) for v in out.values())} groups')
