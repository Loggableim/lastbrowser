import type { DesktopLocaleId } from './keys.js';

/** Perceived-latency sentences. German is the primary copy.
 *  Personas: nova (Nova), analytical (Orion), developer (Patch), creative (Spark), mentor (Zen).
 *  first: streamed from 2s. late: apology / patience, streamed from 6s.
 *  Numbering matches chat.latencyPlaceholder.01–.12.
 */
export const chatLatencyPersonalities = ['nova', 'analytical', 'developer', 'creative', 'mentor'] as const;
export type ChatLatencyPersonality = typeof chatLatencyPersonalities[number];
export const chatLatencyPersonaNames: Record<ChatLatencyPersonality, string> = {
  nova: 'Nova',
  analytical: 'Orion',
  developer: 'Patch',
  creative: 'Spark',
  mentor: 'Zen',
};
const chatLatencySlots = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'] as const;
export type ChatLatencySlot = typeof chatLatencySlots[number];
export type ChatLatencyPlaceholderKey =
  | `chat.latencyPlaceholder.${ChatLatencyPersonality}.${ChatLatencySlot}`
  | `chat.latencyPlaceholder.${ChatLatencyPersonality}.late.${ChatLatencySlot}`;

type SentenceTable = Record<ChatLatencyPersonality, { first: readonly string[]; late: readonly string[] }>;

const sentences = {
  "de": {
    "nova": {
      "first": [
        "Einen Moment, ich ordne das gerade.",
        "Ich bin dran und sammle den Faden.",
        "Kurz nachdenken, dann kommt die Antwort.",
        "Ich lese deine Frage noch einmal in Ruhe.",
        "Gleich, ich setze die Punkte zusammen.",
        "Ich bleibe bei dir, die Antwort formt sich.",
        "Einen Augenblick, ich schaue genauer hin.",
        "Ich sortiere, was hier wirklich zählt.",
        "Kurz Luft holen, dann geht es weiter.",
        "Ich halte den Gedanken fest und formuliere.",
        "Einen kleinen Moment, ich bin mittendrin.",
        "Ich baue die Antwort Satz für Satz."
      ],
      "late": [
        "Sorry, das dauert länger als gedacht.",
        "Entschuldige, die Aufgabe ist größer. Es dauert noch etwas, bitte hab Geduld.",
        "Tut mir leid, ich brauche noch einen Moment.",
        "Sorry, das ist umfangreicher, ich bleibe dran.",
        "Entschuldige die Wartezeit, die Antwort kommt.",
        "Tut mir leid, das braucht etwas mehr Zeit.",
        "Sorry, ich bin noch nicht fertig, bitte bleib kurz dabei.",
        "Entschuldige, der Weg ist länger als erwartet.",
        "Tut mir leid für die Pause, ich arbeite weiter.",
        "Sorry, das ist eine größere Aufgabe, danke für deine Geduld.",
        "Entschuldige, ich brauche noch etwas Ruhe dafür.",
        "Tut mir leid, es dauert, aber ich lasse dich nicht hängen."
      ]
    },
    "analytical": {
      "first": [
        "Ich prüfe die Annahmen, bevor ich antworte.",
        "Einen Moment, ich trenne die relevanten Punkte.",
        "Ich gewichte die Faktoren der Reihe nach.",
        "Kurz analysieren, dann folgt die Schlussfolgerung.",
        "Ich gleiche die Angaben miteinander ab.",
        "Die Struktur steht noch nicht, ich ordne sie.",
        "Ich prüfe, welcher Schritt zuerst trägt.",
        "Einen Augenblick für die genaue Einordnung.",
        "Ich ziehe die Linie von der Frage zur Antwort.",
        "Die Details werden noch sortiert.",
        "Ich halte die Bedingungen fest und prüfe sie.",
        "Gleich, die Auswertung ist noch offen."
      ],
      "late": [
        "Sorry, die Prüfung dauert länger als erwartet.",
        "Entschuldige, die Aufgabe ist größer und braucht mehr Sorgfalt.",
        "Tut mir leid, die Analyse ist noch nicht abgeschlossen.",
        "Sorry, der Befund braucht noch einen Durchgang.",
        "Entschuldige die Verzögerung, die Genauigkeit geht vor.",
        "Tut mir leid, das ist umfangreicher als der erste Blick.",
        "Sorry, ich gleiche noch offene Punkte ab.",
        "Entschuldige, die Auswertung braucht etwas länger.",
        "Tut mir leid, bitte hab Geduld, die Prüfung läuft.",
        "Sorry, die Aufgabe ist größer, ich bleibe bei der Sache.",
        "Entschuldige, ein weiterer Schritt ist noch nötig.",
        "Tut mir leid, die Antwort folgt, sobald die Prüfung sitzt."
      ]
    },
    "developer": {
      "first": [
        "Kurz nachsehen, dann kommt der konkrete Schritt.",
        "Ich gehe den Ablauf durch.",
        "Einen Moment, ich suche die eigentliche Ursache.",
        "Ich prüfe, was hier wirklich bricht.",
        "Gleich, ich baue den nächsten sinnvollen Schritt.",
        "Ich lese den Fehlerpfad noch einmal.",
        "Kurz im Code denken, dann antworte ich.",
        "Ich halte die Änderung klein und klar.",
        "Einen Augenblick, ich prüfe den Randfall.",
        "Ich setze die Schritte in die richtige Reihenfolge.",
        "Gleich, ich formuliere das so, dass du es ausführen kannst.",
        "Ich schaue, welcher Fix hier trägt."
      ],
      "late": [
        "Sorry, das dauert länger als ein schneller Fix.",
        "Entschuldige, die Aufgabe ist größer, bitte hab Geduld.",
        "Tut mir leid, der Pfad ist länger als gedacht.",
        "Sorry, ich debugge noch, das braucht einen Moment.",
        "Entschuldige die Wartezeit, der nächste Schritt kommt.",
        "Tut mir leid, das ist mehr als eine Zeile.",
        "Sorry, ich prüfe noch den Rand, bevor ich rate.",
        "Entschuldige, der Plan ist noch nicht grün.",
        "Tut mir leid, bitte bleib dran, ich bin im Code.",
        "Sorry, die Aufgabe ist größer, ich mache sie fertig.",
        "Entschuldige, ein sauberer Fix braucht hier länger.",
        "Tut mir leid, ich lasse den Fehler nicht halb liegen."
      ]
    },
    "creative": {
      "first": [
        "Ich lasse die Idee kurz aufleuchten.",
        "Einen Moment, ich mische die Farben der Antwort.",
        "Gleich sprüht es, ich sammle noch Funken.",
        "Ich drehe den Gedanken einmal ins Licht.",
        "Kurz fantasieren, dann wird es konkret.",
        "Ich suche den überraschenden, klaren Winkel.",
        "Einen Augenblick, die Szene setzt sich zusammen.",
        "Ich spiele die Variante durch, die sich lebendig anfühlt.",
        "Gleich, ich gebe der Idee eine Form.",
        "Ich höre hin, welcher Ton hier passt.",
        "Einen kleinen Wirbel, dann steht der Satz.",
        "Ich skizziere die Antwort, bevor ich sie ausspreche."
      ],
      "late": [
        "Sorry, die Idee braucht länger als ein Funke.",
        "Entschuldige, die Aufgabe ist größer, bitte bleib neugierig.",
        "Tut mir leid, das Bild ist noch nicht fertig.",
        "Sorry, der kreative Weg ist diesmal weiter.",
        "Entschuldige die Pause, die gute Wendung kommt noch.",
        "Tut mir leid, ich lasse die Idee nicht halb im Dunkeln.",
        "Sorry, das ist eine größere Leinwand, hab Geduld.",
        "Entschuldige, ich feile noch an der überraschenden Stelle.",
        "Tut mir leid, der Glanz braucht noch einen Moment.",
        "Sorry, die Aufgabe ist größer, ich bleibe dran.",
        "Entschuldige, gleich wird aus der Skizze eine Antwort.",
        "Tut mir leid fürs Warten, die Pointe soll sitzen."
      ]
    },
    "mentor": {
      "first": [
        "Atme kurz mit, ich gehe den Weg in Ruhe.",
        "Einen Moment, ich höre der Frage erst zu.",
        "Ich lasse den nächsten Schritt klar werden.",
        "In Ruhe schauen, was du wirklich brauchst.",
        "Ich bleibe bei dir, die Antwort reift.",
        "Einen Augenblick der Stille, dann die Richtung.",
        "Ich trenne das Dringende vom Wesentlichen.",
        "Gleich, ich formuliere es so, dass es trägt.",
        "Ich gehe einen Schritt zurück und sehe klarer.",
        "Kurz innehalten, dann begleite ich dich weiter.",
        "Ich halte den Raum, bis der Gedanke sitzt.",
        "Einen ruhigen Moment, die Orientierung kommt."
      ],
      "late": [
        "Sorry, das braucht mehr Ruhe als erwartet.",
        "Entschuldige, die Aufgabe ist größer, bitte hab Geduld mit dem Weg.",
        "Tut mir leid, wir sind noch nicht am klaren Punkt.",
        "Sorry, der Weg ist länger, ich bleibe an deiner Seite.",
        "Entschuldige die Wartezeit, Gründlichkeit ist hier die Güte.",
        "Tut mir leid, ich überstürze die Antwort nicht.",
        "Sorry, das ist eine größere Aufgabe, atme mit.",
        "Entschuldige, die Einsicht braucht noch einen Moment.",
        "Tut mir leid, bitte bleib geduldig, ich führe weiter.",
        "Sorry, der Prozess ist tiefer als der erste Blick.",
        "Entschuldige, ich lasse dich mit der offenen Frage nicht allein.",
        "Tut mir leid, es dauert, und das ist in Ordnung."
      ]
    }
  },
  "en": {
    "nova": {
      "first": [
        "One moment, I am sorting this out.",
        "I am on it and gathering the thread.",
        "A short think, then the answer comes.",
        "I am reading your question once more, calmly.",
        "Almost there, I am putting the points together.",
        "I am staying with you while the reply takes shape.",
        "Give me a second to look more closely.",
        "I am sorting what actually matters here.",
        "A quick breath, then I will continue.",
        "I am holding the thought and wording it.",
        "A small moment, I am right in the middle of it.",
        "I am building the answer sentence by sentence."
      ],
      "late": [
        "Sorry, this is taking longer than expected.",
        "Sorry, the task is larger. It will take a bit longer, please be patient.",
        "I am sorry, I still need a moment.",
        "Sorry, this is broader than it looked, and I am still on it.",
        "Sorry for the wait, the answer is coming.",
        "I am sorry, this needs a little more time.",
        "Sorry, I am not finished yet. Please stay with me a moment.",
        "Sorry, the path is longer than expected.",
        "I am sorry about the pause. I am still working.",
        "Sorry, this is a larger task. Thank you for your patience.",
        "Sorry, I need a little more quiet for this.",
        "I am sorry it is taking time. I will not leave you hanging."
      ]
    },
    "analytical": {
      "first": [
        "I am checking the assumptions before I answer.",
        "One moment, I am separating the relevant points.",
        "I am weighing the factors in order.",
        "A short analysis, then the conclusion follows.",
        "I am comparing the details against each other.",
        "The structure is not set yet. I am ordering it.",
        "I am checking which step holds first.",
        "A moment for the precise classification.",
        "I am drawing the line from the question to the answer.",
        "The details are still being sorted.",
        "I am noting the conditions and checking them.",
        "Almost there, the evaluation is still open."
      ],
      "late": [
        "Sorry, this check is taking longer than expected.",
        "Sorry, the task is larger and needs more care.",
        "I am sorry, the analysis is not finished yet.",
        "Sorry, the finding needs another pass.",
        "Sorry for the delay. Accuracy comes first.",
        "I am sorry, this is broader than the first look.",
        "Sorry, I am still reconciling the open points.",
        "Sorry, the evaluation needs a little longer.",
        "I am sorry, please be patient. The check is still running.",
        "Sorry, the task is larger. I am staying with it.",
        "Sorry, one more step is still required.",
        "I am sorry, the answer follows once the check holds."
      ]
    },
    "developer": {
      "first": [
        "A quick look, then the concrete step.",
        "I am walking through the flow.",
        "One moment, I am looking for the actual cause.",
        "I am checking what actually breaks here.",
        "Almost there, I am building the next useful step.",
        "I am reading the failure path once more.",
        "A short think in code, then I will answer.",
        "I am keeping the change small and clear.",
        "One moment, I am checking the edge case.",
        "I am putting the steps in the right order.",
        "Almost there, I am wording this so you can run it.",
        "I am seeing which fix holds here."
      ],
      "late": [
        "Sorry, this is taking longer than a quick fix.",
        "Sorry, the task is larger. Please be patient.",
        "I am sorry, the path is longer than I thought.",
        "Sorry, I am still debugging. This needs a moment.",
        "Sorry for the wait. The next step is coming.",
        "I am sorry, this is more than one line.",
        "Sorry, I am still checking the edge before I guess.",
        "Sorry, the plan is not green yet.",
        "I am sorry, please stay with me. I am in the code.",
        "Sorry, the task is larger. I will finish it.",
        "Sorry, a clean fix takes longer here.",
        "I am sorry, I will not leave the bug half done."
      ]
    },
    "creative": {
      "first": [
        "I am letting the idea catch a little light.",
        "One moment, I am mixing the colors of the answer.",
        "Sparks in a second. I am still gathering them.",
        "I am turning the thought toward the light.",
        "A short flight of fancy, then it becomes concrete.",
        "I am looking for the surprising, clear angle.",
        "One moment, the scene is coming together.",
        "I am playing the version that feels alive.",
        "Almost there, I am giving the idea a shape.",
        "I am listening for the tone that fits.",
        "A small swirl, then the sentence stands.",
        "I am sketching the answer before I say it."
      ],
      "late": [
        "Sorry, the idea needs longer than a spark.",
        "Sorry, the task is larger. Please stay curious.",
        "I am sorry, the picture is not finished yet.",
        "Sorry, the creative path is longer this time.",
        "Sorry for the pause. The good turn is still coming.",
        "I am sorry, I will not leave the idea half in the dark.",
        "Sorry, this is a larger canvas. Please be patient.",
        "Sorry, I am still sharpening the surprising part.",
        "I am sorry, the shine needs another moment.",
        "Sorry, the task is larger. I am staying with it.",
        "Sorry, the sketch is about to become an answer.",
        "I am sorry for the wait. The point should land."
      ]
    },
    "mentor": {
      "first": [
        "Breathe with me. I am walking the path calmly.",
        "One moment, I am listening to the question first.",
        "I am letting the next step become clear.",
        "A calm look at what you actually need.",
        "I am staying with you while the answer ripens.",
        "A quiet second, then the direction.",
        "I am separating the urgent from the essential.",
        "Almost there, I am wording this so it holds.",
        "I am stepping back so I can see more clearly.",
        "A short pause, then I will walk with you further.",
        "I am holding the space until the thought settles.",
        "A quiet moment. The orientation is coming."
      ],
      "late": [
        "Sorry, this needs more calm than expected.",
        "Sorry, the task is larger. Please be patient with the path.",
        "I am sorry, we are not at the clear point yet.",
        "Sorry, the way is longer. I am staying beside you.",
        "Sorry for the wait. Thoroughness is the kindness here.",
        "I am sorry, I will not rush the answer.",
        "Sorry, this is a larger task. Breathe with me.",
        "Sorry, the insight needs another moment.",
        "I am sorry, please stay patient. I am still guiding.",
        "Sorry, the process is deeper than the first look.",
        "Sorry, I will not leave you with the open question.",
        "I am sorry it is taking time, and that is all right."
      ]
    }
  },
  "es": {
    "nova": {
      "first": [
        "Un momento, estoy ordenando esto.",
        "Estoy en ello y recojo el hilo.",
        "Pienso un instante y llega la respuesta.",
        "Leo tu pregunta otra vez, con calma.",
        "Ya casi, estoy juntando los puntos.",
        "Sigo contigo mientras la respuesta toma forma.",
        "Dame un segundo para mirar más de cerca.",
        "Ordeno lo que de verdad importa aquí.",
        "Un respiro, y sigo.",
        "Sujeto la idea y la estoy redactando.",
        "Un momento pequeño, estoy en medio.",
        "Construyo la respuesta frase por frase."
      ],
      "late": [
        "Perdón, esto está tardando más de lo esperado.",
        "Perdón, la tarea es más grande. Tardará un poco más, ten paciencia.",
        "Lo siento, todavía necesito un momento.",
        "Perdón, esto es más amplio y sigo en ello.",
        "Perdón por la espera, la respuesta llega.",
        "Lo siento, esto necesita un poco más de tiempo.",
        "Perdón, aún no he terminado. Quédate un momento.",
        "Perdón, el camino es más largo de lo esperado.",
        "Lo siento por la pausa. Sigo trabajando.",
        "Perdón, es una tarea más grande. Gracias por tu paciencia.",
        "Perdón, necesito un poco más de calma para esto.",
        "Lo siento que tarde. No te dejo colgado."
      ]
    },
    "analytical": {
      "first": [
        "Reviso las suposiciones antes de responder.",
        "Un momento, separo los puntos relevantes.",
        "Pondero los factores en orden.",
        "Un análisis breve y luego la conclusión.",
        "Comparo los datos entre sí.",
        "La estructura aún no está. La estoy ordenando.",
        "Compruebo qué paso sostiene primero.",
        "Un instante para la clasificación exacta.",
        "Trazo la línea de la pregunta a la respuesta.",
        "Los detalles todavía se están ordenando.",
        "Anoto las condiciones y las compruebo.",
        "Ya casi, la evaluación sigue abierta."
      ],
      "late": [
        "Perdón, la revisión tarda más de lo esperado.",
        "Perdón, la tarea es más grande y pide más cuidado.",
        "Lo siento, el análisis aún no está cerrado.",
        "Perdón, el hallazgo necesita otra pasada.",
        "Perdón por el retraso. La precisión va primero.",
        "Lo siento, esto es más amplio que la primera mirada.",
        "Perdón, todavía cruzo los puntos abiertos.",
        "Perdón, la evaluación necesita un poco más.",
        "Lo siento, ten paciencia. La revisión sigue.",
        "Perdón, la tarea es más grande. Sigo con ella.",
        "Perdón, todavía hace falta un paso más.",
        "Lo siento, la respuesta llega cuando la revisión cierra."
      ]
    },
    "developer": {
      "first": [
        "Miro rápido y luego va el paso concreto.",
        "Recorro el flujo.",
        "Un momento, busco la causa real.",
        "Compruebo qué se rompe de verdad aquí.",
        "Ya casi, armo el siguiente paso útil.",
        "Leo otra vez la ruta del fallo.",
        "Pienso un momento en código y respondo.",
        "Mantengo el cambio pequeño y claro.",
        "Un instante, reviso el caso límite.",
        "Pongo los pasos en el orden correcto.",
        "Ya casi, lo redacto para que puedas ejecutarlo.",
        "Miro qué arreglo aguanta aquí."
      ],
      "late": [
        "Perdón, esto tarda más que un arreglo rápido.",
        "Perdón, la tarea es más grande. Ten paciencia.",
        "Lo siento, la ruta es más larga de lo que pensé.",
        "Perdón, sigo depurando. Hace falta un momento.",
        "Perdón por la espera. El siguiente paso llega.",
        "Lo siento, esto es más que una línea.",
        "Perdón, reviso el borde antes de adivinar.",
        "Perdón, el plan todavía no está en verde.",
        "Lo siento, quédate. Estoy en el código.",
        "Perdón, la tarea es más grande. La termino.",
        "Perdón, un arreglo limpio tarda más aquí.",
        "Lo siento, no dejo el fallo a medias."
      ]
    },
    "creative": {
      "first": [
        "Dejo que la idea coja un poco de luz.",
        "Un momento, mezclo los colores de la respuesta.",
        "Enseguida saltan chispas. Aún las reúno.",
        "Giro el pensamiento hacia la luz.",
        "Un vuelo breve y luego se vuelve concreto.",
        "Busco el ángulo claro y sorprendente.",
        "Un instante, la escena se está armando.",
        "Pruebo la variante que se siente viva.",
        "Ya casi, le doy forma a la idea.",
        "Escucho qué tono encaja.",
        "Un remolino pequeño y la frase se queda.",
        "Boceto la respuesta antes de decirla."
      ],
      "late": [
        "Perdón, la idea necesita más que una chispa.",
        "Perdón, la tarea es más grande. Sigue con curiosidad.",
        "Lo siento, el cuadro aún no está listo.",
        "Perdón, el camino creativo es más largo esta vez.",
        "Perdón por la pausa. El buen giro todavía llega.",
        "Lo siento, no dejo la idea a medias en la sombra.",
        "Perdón, es un lienzo más grande. Ten paciencia.",
        "Perdón, aún afilo la parte sorprendente.",
        "Lo siento, el brillo necesita otro momento.",
        "Perdón, la tarea es más grande. Sigo con ella.",
        "Perdón, el boceto está a punto de ser respuesta.",
        "Lo siento la espera. La frase tiene que caer bien."
      ]
    },
    "mentor": {
      "first": [
        "Respira conmigo. Recorro el camino con calma.",
        "Un momento, primero escucho la pregunta.",
        "Dejo que el siguiente paso se aclare.",
        "Miro con calma qué necesitas de verdad.",
        "Sigo contigo mientras la respuesta madura.",
        "Un segundo de silencio y luego la dirección.",
        "Separo lo urgente de lo esencial.",
        "Ya casi, lo redacto para que sostenga.",
        "Doy un paso atrás y veo más claro.",
        "Una pausa breve y te acompaño más.",
        "Sostengo el espacio hasta que la idea se asiente.",
        "Un momento tranquilo. La orientación llega."
      ],
      "late": [
        "Perdón, esto pide más calma de la esperada.",
        "Perdón, la tarea es más grande. Ten paciencia con el camino.",
        "Lo siento, aún no estamos en el punto claro.",
        "Perdón, el camino es más largo. Sigo a tu lado.",
        "Perdón por la espera. La profundidad es el cuidado.",
        "Lo siento, no voy a apresurar la respuesta.",
        "Perdón, es una tarea más grande. Respira conmigo.",
        "Perdón, la claridad necesita otro momento.",
        "Lo siento, ten paciencia. Sigo guiando.",
        "Perdón, el proceso es más hondo que la primera mirada.",
        "Perdón, no te dejo con la pregunta abierta.",
        "Lo siento que tarde, y está bien."
      ]
    }
  },
  "fr": {
    "nova": {
      "first": [
        "Un instant, je remets cela en ordre.",
        "Je m'en occupe et je reprends le fil.",
        "Je réfléchis brièvement, puis la réponse vient.",
        "Je relis ta question, tranquillement.",
        "Presque, j'assemble les points.",
        "Je reste avec toi pendant que la réponse se forme.",
        "Donne-moi une seconde pour regarder de plus près.",
        "Je trie ce qui compte vraiment ici.",
        "Une petite respiration, puis je continue.",
        "Je retiens l'idée et je la formule.",
        "Un petit moment, je suis en plein dedans.",
        "Je construis la réponse phrase par phrase."
      ],
      "late": [
        "Désolé, cela prend plus de temps que prévu.",
        "Désolé, la tâche est plus grande. Cela prendra encore un peu, merci de patienter.",
        "Je suis désolé, il me faut encore un moment.",
        "Désolé, c'est plus large, et je reste dessus.",
        "Désolé pour l'attente, la réponse arrive.",
        "Je suis désolé, il faut un peu plus de temps.",
        "Désolé, je n'ai pas fini. Reste encore un instant.",
        "Désolé, le chemin est plus long que prévu.",
        "Je suis désolé pour la pause. Je continue.",
        "Désolé, c'est une tâche plus grande. Merci pour ta patience.",
        "Désolé, il me faut encore un peu de calme.",
        "Je suis désolé que cela dure. Je ne te laisse pas en plan."
      ]
    },
    "analytical": {
      "first": [
        "Je vérifie les hypothèses avant de répondre.",
        "Un instant, je sépare les points utiles.",
        "Je pèse les facteurs dans l'ordre.",
        "Une courte analyse, puis la conclusion.",
        "Je compare les éléments entre eux.",
        "La structure n'est pas fixée. Je la range.",
        "Je vérifie quelle étape tient en premier.",
        "Un moment pour le classement précis.",
        "Je trace la ligne de la question à la réponse.",
        "Les détails sont encore en train d'être triés.",
        "Je note les conditions et je les vérifie.",
        "Presque, l'évaluation est encore ouverte."
      ],
      "late": [
        "Désolé, la vérification prend plus de temps que prévu.",
        "Désolé, la tâche est plus grande et demande plus de soin.",
        "Je suis désolé, l'analyse n'est pas terminée.",
        "Désolé, le constat demande un autre passage.",
        "Désolé pour le délai. La précision passe d'abord.",
        "Je suis désolé, c'est plus large que le premier regard.",
        "Désolé, je recoupe encore les points ouverts.",
        "Désolé, l'évaluation demande un peu plus.",
        "Je suis désolé, merci de patienter. La vérification continue.",
        "Désolé, la tâche est plus grande. Je reste dessus.",
        "Désolé, une étape de plus est encore nécessaire.",
        "Je suis désolé, la réponse suit quand la vérification tient."
      ]
    },
    "developer": {
      "first": [
        "Un coup d'œil, puis l'étape concrète.",
        "Je parcours le flux.",
        "Un instant, je cherche la cause réelle.",
        "Je vérifie ce qui casse vraiment ici.",
        "Presque, je construis la prochaine étape utile.",
        "Je relis le chemin de l'échec.",
        "Je pense un instant dans le code, puis je réponds.",
        "Je garde le changement petit et clair.",
        "Un moment, je vérifie le cas limite.",
        "Je mets les étapes dans le bon ordre.",
        "Presque, je le formule pour que tu puisses l'exécuter.",
        "Je regarde quel correctif tient ici."
      ],
      "late": [
        "Désolé, cela prend plus de temps qu'un correctif rapide.",
        "Désolé, la tâche est plus grande. Merci de patienter.",
        "Je suis désolé, le chemin est plus long que prévu.",
        "Désolé, je débogue encore. Il faut un moment.",
        "Désolé pour l'attente. La prochaine étape arrive.",
        "Je suis désolé, c'est plus qu'une ligne.",
        "Désolé, je vérifie encore le bord avant de deviner.",
        "Désolé, le plan n'est pas encore au vert.",
        "Je suis désolé, reste. Je suis dans le code.",
        "Désolé, la tâche est plus grande. Je la termine.",
        "Désolé, un correctif propre prend plus de temps ici.",
        "Je suis désolé, je ne laisse pas le bug à moitié."
      ]
    },
    "creative": {
      "first": [
        "Je laisse l'idée prendre un peu de lumière.",
        "Un instant, je mélange les couleurs de la réponse.",
        "Les étincelles arrivent. Je les rassemble encore.",
        "Je tourne l'idée vers la lumière.",
        "Un court élan, puis cela devient concret.",
        "Je cherche l'angle clair et surprenant.",
        "Un moment, la scène se compose.",
        "J'essaie la variante qui semble vivante.",
        "Presque, je donne une forme à l'idée.",
        "J'écoute le ton qui convient.",
        "Un petit tourbillon, puis la phrase tient.",
        "Je croque la réponse avant de la dire."
      ],
      "late": [
        "Désolé, l'idée demande plus qu'une étincelle.",
        "Désolé, la tâche est plus grande. Reste curieux.",
        "Je suis désolé, l'image n'est pas finie.",
        "Désolé, le chemin créatif est plus long cette fois.",
        "Désolé pour la pause. Le bon tournant arrive encore.",
        "Je suis désolé, je ne laisse pas l'idée à moitié dans l'ombre.",
        "Désolé, c'est une plus grande toile. Merci de patienter.",
        "Désolé, j'affine encore la partie surprenante.",
        "Je suis désolé, l'éclat a besoin d'un moment.",
        "Désolé, la tâche est plus grande. Je reste dessus.",
        "Désolé, le croquis va devenir une réponse.",
        "Je suis désolé pour l'attente. La chute doit tenir."
      ]
    },
    "mentor": {
      "first": [
        "Respire avec moi. J'avance sur le chemin calmement.",
        "Un instant, j'écoute d'abord la question.",
        "Je laisse l'étape suivante devenir claire.",
        "Je regarde avec calme ce dont tu as vraiment besoin.",
        "Je reste avec toi pendant que la réponse mûrit.",
        "Une seconde de silence, puis la direction.",
        "Je sépare l'urgent de l'essentiel.",
        "Presque, je le formule pour qu'il tienne.",
        "Je fais un pas en arrière et je vois plus clair.",
        "Une courte pause, puis je t'accompagne plus loin.",
        "Je tiens l'espace jusqu'à ce que l'idée se pose.",
        "Un moment calme. L'orientation arrive."
      ],
      "late": [
        "Désolé, cela demande plus de calme que prévu.",
        "Désolé, la tâche est plus grande. Merci de patienter sur le chemin.",
        "Je suis désolé, nous ne sommes pas encore au point clair.",
        "Désolé, le chemin est plus long. Je reste à tes côtés.",
        "Désolé pour l'attente. La profondeur est ici la douceur.",
        "Je suis désolé, je ne vais pas presser la réponse.",
        "Désolé, c'est une tâche plus grande. Respire avec moi.",
        "Désolé, la clarté a besoin d'un moment encore.",
        "Je suis désolé, reste patient. Je guide encore.",
        "Désolé, le processus est plus profond que le premier regard.",
        "Désolé, je ne te laisse pas avec la question ouverte.",
        "Je suis désolé que cela dure, et c'est très bien."
      ]
    }
  },
  "it": {
    "nova": {
      "first": [
        "Un momento, sto mettendo in ordine.",
        "Ci sono, e raccolgo il filo.",
        "Penso un attimo, poi arriva la risposta.",
        "Rileggo la tua domanda con calma.",
        "Quasi, sto unendo i punti.",
        "Resto con te mentre la risposta prende forma.",
        "Dammi un secondo per guardare più da vicino.",
        "Metto in ordine ciò che conta davvero.",
        "Un respiro, poi continuo.",
        "Tengo il pensiero e lo sto formulando.",
        "Un piccolo momento, sono nel mezzo.",
        "Costruisco la risposta frase per frase."
      ],
      "late": [
        "Scusa, ci sta mettendo più del previsto.",
        "Scusa, il compito è più grande. Ci vorrà ancora un po', abbi pazienza.",
        "Mi dispiace, mi serve ancora un momento.",
        "Scusa, è più ampio e ci resto sopra.",
        "Scusa per l'attesa, la risposta arriva.",
        "Mi dispiace, serve un po' più di tempo.",
        "Scusa, non ho ancora finito. Resta un momento.",
        "Scusa, la strada è più lunga del previsto.",
        "Mi dispiace per la pausa. Continuo a lavorare.",
        "Scusa, è un compito più grande. Grazie per la pazienza.",
        "Scusa, mi serve ancora un po' di calma.",
        "Mi dispiace che ci voglia tempo. Non ti lascio a metà."
      ]
    },
    "analytical": {
      "first": [
        "Controllo le ipotesi prima di rispondere.",
        "Un momento, separo i punti rilevanti.",
        "Peso i fattori in ordine.",
        "Una breve analisi, poi la conclusione.",
        "Confronto i dati tra loro.",
        "La struttura non è ancora fissata. La ordino.",
        "Controllo quale passo regge per primo.",
        "Un attimo per la classificazione precisa.",
        "Traccio la linea dalla domanda alla risposta.",
        "I dettagli si stanno ancora ordinando.",
        "Annoto le condizioni e le verifico.",
        "Quasi, la valutazione è ancora aperta."
      ],
      "late": [
        "Scusa, il controllo richiede più del previsto.",
        "Scusa, il compito è più grande e chiede più cura.",
        "Mi dispiace, l'analisi non è ancora chiusa.",
        "Scusa, il risultato chiede un altro passaggio.",
        "Scusa per il ritardo. Prima viene la precisione.",
        "Mi dispiace, è più ampio del primo sguardo.",
        "Scusa, sto ancora incrociando i punti aperti.",
        "Scusa, la valutazione chiede ancora un po'.",
        "Mi dispiace, abbi pazienza. Il controllo prosegue.",
        "Scusa, il compito è più grande. Ci resto.",
        "Scusa, serve ancora un passo.",
        "Mi dispiace, la risposta arriva quando il controllo regge."
      ]
    },
    "developer": {
      "first": [
        "Do un'occhiata, poi arriva il passo concreto.",
        "Percorro il flusso.",
        "Un momento, cerco la causa vera.",
        "Controllo che cosa si rompe davvero qui.",
        "Quasi, costruisco il prossimo passo utile.",
        "Rileggo il percorso dell'errore.",
        "Penso un attimo nel codice, poi rispondo.",
        "Tengo la modifica piccola e chiara.",
        "Un attimo, controllo il caso limite.",
        "Metto i passi nell'ordine giusto.",
        "Quasi, lo scrivo così puoi eseguirlo.",
        "Guardo quale correzione regge qui."
      ],
      "late": [
        "Scusa, ci mette più di una correzione rapida.",
        "Scusa, il compito è più grande. Abbi pazienza.",
        "Mi dispiace, il percorso è più lungo del previsto.",
        "Scusa, sto ancora facendo debug. Serve un momento.",
        "Scusa per l'attesa. Il passo successivo arriva.",
        "Mi dispiace, è più di una riga.",
        "Scusa, controllo ancora il bordo prima di indovinare.",
        "Scusa, il piano non è ancora verde.",
        "Mi dispiace, resta. Sono nel codice.",
        "Scusa, il compito è più grande. Lo finisco.",
        "Scusa, una correzione pulita qui chiede più tempo.",
        "Mi dispiace, non lascio il bug a metà."
      ]
    },
    "creative": {
      "first": [
        "Lascio che l'idea prenda un po' di luce.",
        "Un momento, mescolo i colori della risposta.",
        "Tra un attimo le scintille. Le sto ancora raccogliendo.",
        "Giro il pensiero verso la luce.",
        "Un breve volo, poi diventa concreto.",
        "Cerco l'angolo chiaro e sorprendente.",
        "Un attimo, la scena si sta componendo.",
        "Provo la variante che sembra viva.",
        "Quasi, do una forma all'idea.",
        "Ascolto quale tono ci sta.",
        "Un piccolo vortice, poi la frase sta in piedi.",
        "Schizzo la risposta prima di dirla."
      ],
      "late": [
        "Scusa, l'idea chiede più di una scintilla.",
        "Scusa, il compito è più grande. Resta curioso.",
        "Mi dispiace, l'immagine non è ancora finita.",
        "Scusa, la strada creativa è più lunga questa volta.",
        "Scusa per la pausa. La svolta buona arriva ancora.",
        "Mi dispiace, non lascio l'idea a metà nel buio.",
        "Scusa, è una tela più grande. Abbi pazienza.",
        "Scusa, sto ancora affinando la parte sorprendente.",
        "Mi dispiace, il luccichio chiede un altro momento.",
        "Scusa, il compito è più grande. Ci resto.",
        "Scusa, lo schizzo sta per diventare una risposta.",
        "Mi dispiace per l'attesa. La chiusa deve arrivare bene."
      ]
    },
    "mentor": {
      "first": [
        "Respira con me. Percorro la strada con calma.",
        "Un momento, prima ascolto la domanda.",
        "Lascio che il passo successivo diventi chiaro.",
        "Guardo con calma che cosa ti serve davvero.",
        "Resto con te mentre la risposta matura.",
        "Un secondo di silenzio, poi la direzione.",
        "Separo l'urgente dall'essenziale.",
        "Quasi, lo formulo perché regga.",
        "Faccio un passo indietro e vedo più chiaro.",
        "Una breve pausa, poi ti accompagno oltre.",
        "Tengo lo spazio finché il pensiero si posa.",
        "Un momento quieto. L'orientamento arriva."
      ],
      "late": [
        "Scusa, serve più calma del previsto.",
        "Scusa, il compito è più grande. Abbi pazienza con la strada.",
        "Mi dispiace, non siamo ancora al punto chiaro.",
        "Scusa, la via è più lunga. Resto al tuo fianco.",
        "Scusa per l'attesa. La cura qui è non avere fretta.",
        "Mi dispiace, non metto fretta alla risposta.",
        "Scusa, è un compito più grande. Respira con me.",
        "Scusa, la chiarezza chiede ancora un momento.",
        "Mi dispiace, resta paziente. Continuo a guidare.",
        "Scusa, il processo è più profondo del primo sguardo.",
        "Scusa, non ti lascio con la domanda aperta.",
        "Mi dispiace che ci voglia tempo, e va bene così."
      ]
    }
  },
  "pt-BR": {
    "nova": {
      "first": [
        "Um momento, estou organizando isso.",
        "Estou nisso e juntando o fio.",
        "Penso um instante e a resposta vem.",
        "Leio sua pergunta de novo, com calma.",
        "Quase, estou juntando os pontos.",
        "Fico com você enquanto a resposta toma forma.",
        "Me dá um segundo para olhar mais de perto.",
        "Organizo o que realmente importa aqui.",
        "Uma respirada, e eu continuo.",
        "Seguro a ideia e estou formulando.",
        "Um momento pequeno, estou no meio.",
        "Monto a resposta frase por frase."
      ],
      "late": [
        "Desculpa, isso está demorando mais do que o esperado.",
        "Desculpa, a tarefa é maior. Vai levar mais um pouco, tenha paciência.",
        "Sinto muito, ainda preciso de um momento.",
        "Desculpa, isso é mais amplo e eu continuo nisso.",
        "Desculpa pela espera, a resposta vem.",
        "Sinto muito, isso precisa de um pouco mais de tempo.",
        "Desculpa, ainda não terminei. Fica mais um instante.",
        "Desculpa, o caminho é mais longo do que o esperado.",
        "Sinto muito pela pausa. Continuo trabalhando.",
        "Desculpa, é uma tarefa maior. Obrigado pela paciência.",
        "Desculpa, preciso de um pouco mais de calma para isso.",
        "Sinto muito que esteja demorando. Não te deixo no vazio."
      ]
    },
    "analytical": {
      "first": [
        "Confiro as premissas antes de responder.",
        "Um momento, separo os pontos relevantes.",
        "Peso os fatores em ordem.",
        "Uma análise curta, depois a conclusão.",
        "Comparo os dados entre si.",
        "A estrutura ainda não está firme. Estou ordenando.",
        "Confiro qual passo sustenta primeiro.",
        "Um instante para a classificação exata.",
        "Traço a linha da pergunta até a resposta.",
        "Os detalhes ainda estão sendo ordenados.",
        "Anoto as condições e as confiro.",
        "Quase, a avaliação ainda está aberta."
      ],
      "late": [
        "Desculpa, a verificação está demorando mais do que o esperado.",
        "Desculpa, a tarefa é maior e pede mais cuidado.",
        "Sinto muito, a análise ainda não fechou.",
        "Desculpa, o achado precisa de mais uma passada.",
        "Desculpa pelo atraso. A precisão vem primeiro.",
        "Sinto muito, isso é mais amplo do que o primeiro olhar.",
        "Desculpa, ainda cruzo os pontos abertos.",
        "Desculpa, a avaliação precisa de um pouco mais.",
        "Sinto muito, tenha paciência. A verificação segue.",
        "Desculpa, a tarefa é maior. Continuo nela.",
        "Desculpa, ainda falta mais um passo.",
        "Sinto muito, a resposta vem quando a verificação fechar."
      ]
    },
    "developer": {
      "first": [
        "Olho rápido, depois vem o passo concreto.",
        "Percorro o fluxo.",
        "Um momento, procuro a causa real.",
        "Confiro o que realmente quebra aqui.",
        "Quase, monto o próximo passo útil.",
        "Leio de novo o caminho da falha.",
        "Penso um instante no código e respondo.",
        "Mantenho a mudança pequena e clara.",
        "Um instante, confiro o caso de borda.",
        "Coloco os passos na ordem certa.",
        "Quase, escrevo isso para você poder executar.",
        "Vejo qual correção segura aqui."
      ],
      "late": [
        "Desculpa, isso demora mais do que um conserto rápido.",
        "Desculpa, a tarefa é maior. Tenha paciência.",
        "Sinto muito, o caminho é mais longo do que eu pensava.",
        "Desculpa, ainda estou depurando. Precisa de um momento.",
        "Desculpa pela espera. O próximo passo vem.",
        "Sinto muito, isso é mais do que uma linha.",
        "Desculpa, ainda confiro a borda antes de chutar.",
        "Desculpa, o plano ainda não está verde.",
        "Sinto muito, fica comigo. Estou no código.",
        "Desculpa, a tarefa é maior. Eu termino.",
        "Desculpa, uma correção limpa leva mais tempo aqui.",
        "Sinto muito, não deixo o erro pela metade."
      ]
    },
    "creative": {
      "first": [
        "Deixo a ideia pegar um pouco de luz.",
        "Um momento, misturo as cores da resposta.",
        "Já já saem faíscas. Ainda estou juntando.",
        "Viro o pensamento para a luz.",
        "Um voo curto, depois fica concreto.",
        "Procuro o ângulo claro e surpreendente.",
        "Um instante, a cena está se formando.",
        "Testo a variante que parece viva.",
        "Quase, dou forma à ideia.",
        "Escuto qual tom combina.",
        "Um redemoinho pequeno e a frase fica de pé.",
        "Rabisco a resposta antes de dizê-la."
      ],
      "late": [
        "Desculpa, a ideia precisa de mais do que uma faísca.",
        "Desculpa, a tarefa é maior. Continua curioso.",
        "Sinto muito, a imagem ainda não está pronta.",
        "Desculpa, o caminho criativo está mais longo desta vez.",
        "Desculpa pela pausa. A boa virada ainda vem.",
        "Sinto muito, não deixo a ideia pela metade no escuro.",
        "Desculpa, é uma tela maior. Tenha paciência.",
        "Desculpa, ainda afio a parte surpreendente.",
        "Sinto muito, o brilho precisa de mais um momento.",
        "Desculpa, a tarefa é maior. Continuo nela.",
        "Desculpa, o rascunho está prestes a virar resposta.",
        "Sinto muito pela espera. A frase precisa acertar."
      ]
    },
    "mentor": {
      "first": [
        "Respira comigo. Sigo o caminho com calma.",
        "Um momento, primeiro escuto a pergunta.",
        "Deixo o próximo passo ficar claro.",
        "Olho com calma o que você realmente precisa.",
        "Fico com você enquanto a resposta amadurece.",
        "Um segundo de silêncio, depois a direção.",
        "Separo o urgente do essencial.",
        "Quase, formulo isso para que sustente.",
        "Dou um passo atrás e enxergo melhor.",
        "Uma pausa curta, depois eu te acompanho adiante.",
        "Seguro o espaço até o pensamento assentar.",
        "Um momento quieto. A orientação vem."
      ],
      "late": [
        "Desculpa, isso pede mais calma do que o esperado.",
        "Desculpa, a tarefa é maior. Tenha paciência com o caminho.",
        "Sinto muito, ainda não estamos no ponto claro.",
        "Desculpa, o caminho é mais longo. Continuo ao seu lado.",
        "Desculpa pela espera. O cuidado aqui é não apressar.",
        "Sinto muito, não vou apressar a resposta.",
        "Desculpa, é uma tarefa maior. Respira comigo.",
        "Desculpa, a clareza precisa de mais um momento.",
        "Sinto muito, fica paciente. Continuo guiando.",
        "Desculpa, o processo é mais fundo do que o primeiro olhar.",
        "Desculpa, não te deixo com a pergunta aberta.",
        "Sinto muito que demore, e tudo bem."
      ]
    }
  },
  "ru": {
    "nova": {
      "first": [
        "Минуту, я как раз раскладываю это по местам.",
        "Я уже в деле и собираю нить.",
        "Коротко подумаю, и ответ придёт.",
        "Ещё раз спокойно читаю твой вопрос.",
        "Почти, складываю пункты вместе.",
        "Я рядом, пока ответ обретает форму.",
        "Дай секунду посмотреть внимательнее.",
        "Отбираю то, что здесь действительно важно.",
        "Короткий вдох, и я продолжаю.",
        "Держу мысль и формулирую её.",
        "Небольшой момент, я прямо в середине.",
        "Собираю ответ фразу за фразой."
      ],
      "late": [
        "Прости, это занимает больше времени, чем ожидалось.",
        "Прости, задача крупнее. Понадобится ещё немного, пожалуйста, подожди.",
        "Извини, мне ещё нужен момент.",
        "Прости, это шире, чем казалось, и я всё ещё в работе.",
        "Прости за ожидание, ответ уже идёт.",
        "Извини, нужно чуть больше времени.",
        "Прости, я ещё не закончил. Побудь ещё немного.",
        "Прости, путь длиннее, чем ожидалось.",
        "Извини за паузу. Я продолжаю.",
        "Прости, задача крупнее. Спасибо за терпение.",
        "Прости, для этого нужно ещё немного тишины.",
        "Извини, что это тянется. Я тебя не брошу."
      ]
    },
    "analytical": {
      "first": [
        "Проверяю допущения, прежде чем ответить.",
        "Минуту, отделяю существенные пункты.",
        "Взвешиваю факторы по порядку.",
        "Короткий разбор, затем вывод.",
        "Сверяю данные между собой.",
        "Структура ещё не стоит. Я её упорядочиваю.",
        "Проверяю, какой шаг держит первым.",
        "Мгновение на точную классификацию.",
        "Провожу линию от вопроса к ответу.",
        "Детали ещё раскладываются.",
        "Фиксирую условия и проверяю их.",
        "Почти, оценка ещё открыта."
      ],
      "late": [
        "Прости, проверка занимает больше времени, чем ожидалось.",
        "Прости, задача крупнее и требует больше тщательности.",
        "Извини, анализ ещё не закрыт.",
        "Прости, вывод просит ещё один проход.",
        "Прости за задержку. Сначала точность.",
        "Извини, это шире первого взгляда.",
        "Прости, я ещё сверяю открытые пункты.",
        "Прости, оценке нужно чуть больше времени.",
        "Извини, пожалуйста, подожди. Проверка идёт.",
        "Прости, задача крупнее. Я остаюсь на ней.",
        "Прости, нужен ещё один шаг.",
        "Извини, ответ придёт, когда проверка сойдётся."
      ]
    },
    "developer": {
      "first": [
        "Быстро смотрю, затем конкретный шаг.",
        "Прохожу поток.",
        "Минуту, ищу настоящую причину.",
        "Проверяю, что здесь действительно ломается.",
        "Почти, собираю следующий полезный шаг.",
        "Ещё раз читаю путь сбоя.",
        "Коротко думаю в коде, потом отвечу.",
        "Держу изменение маленьким и ясным.",
        "Мгновение, проверяю краевой случай.",
        "Ставлю шаги в верный порядок.",
        "Почти, формулирую так, чтобы это можно было выполнить.",
        "Смотрю, какое исправление здесь держит."
      ],
      "late": [
        "Прости, это дольше, чем быстрый фикс.",
        "Прости, задача крупнее. Пожалуйста, подожди.",
        "Извини, путь длиннее, чем я думал.",
        "Прости, я ещё отлаживаю. Нужен момент.",
        "Прости за ожидание. Следующий шаг идёт.",
        "Извини, это больше одной строки.",
        "Прости, ещё проверяю край, прежде чем гадать.",
        "Прости, план ещё не зелёный.",
        "Извини, останься. Я в коде.",
        "Прости, задача крупнее. Я её доведу.",
        "Прости, чистое исправление здесь занимает дольше.",
        "Извини, не оставлю ошибку наполовину."
      ]
    },
    "creative": {
      "first": [
        "Даю идее чуть-чуть света.",
        "Минуту, смешиваю краски ответа.",
        "Сейчас будут искры. Я ещё их собираю.",
        "Поворачиваю мысль к свету.",
        "Короткий полёт, потом это станет конкретным.",
        "Ищу ясный и неожиданный угол.",
        "Мгновение, сцена складывается.",
        "Пробую вариант, который кажется живым.",
        "Почти, придаю идее форму.",
        "Слушаю, какой тон сюда подходит.",
        "Маленький вихрь, и фраза встаёт.",
        "Набрасываю ответ, прежде чем сказать его."
      ],
      "late": [
        "Прости, идее нужно больше, чем искра.",
        "Прости, задача крупнее. Останься любопытным.",
        "Извини, картина ещё не готова.",
        "Прости, творческий путь на этот раз длиннее.",
        "Прости за паузу. Хороший поворот ещё будет.",
        "Извини, не оставлю идею наполовину в темноте.",
        "Прости, это больший холст. Пожалуйста, подожди.",
        "Прости, ещё оттачиваю неожиданную часть.",
        "Извини, блеску нужен ещё момент.",
        "Прости, задача крупнее. Я остаюсь на ней.",
        "Прости, набросок вот-вот станет ответом.",
        "Извини за ожидание. Фраза должна попасть."
      ]
    },
    "mentor": {
      "first": [
        "Побудь со мной в дыхании. Я иду по пути спокойно.",
        "Минуту, сначала слушаю вопрос.",
        "Даю следующему шагу проясниться.",
        "Спокойно смотрю, что тебе действительно нужно.",
        "Я рядом, пока ответ созревает.",
        "Секунда тишины, затем направление.",
        "Отделяю срочное от существенного.",
        "Почти, формулирую так, чтобы это держалось.",
        "Делаю шаг назад и вижу яснее.",
        "Короткая пауза, затем я пойду с тобой дальше.",
        "Держу пространство, пока мысль не уляжется.",
        "Тихий момент. Ориентир уже идёт."
      ],
      "late": [
        "Прости, этому нужно больше спокойствия, чем ожидалось.",
        "Прости, задача крупнее. Пожалуйста, подожди на этом пути.",
        "Извини, мы ещё не в ясной точке.",
        "Прости, путь длиннее. Я остаюсь рядом.",
        "Прости за ожидание. Здесь доброта в тщательности.",
        "Извини, я не буду торопить ответ.",
        "Прости, задача крупнее. Побудь со мной в дыхании.",
        "Прости, ясности нужен ещё момент.",
        "Извини, останься терпеливым. Я всё ещё веду.",
        "Прости, процесс глубже первого взгляда.",
        "Прости, не оставлю тебя с открытым вопросом.",
        "Извини, что это занимает время, и это нормально."
      ]
    }
  },
  "ja": {
    "nova": {
      "first": [
        "少し待って。いま整理しているよ。",
        "取り組んでいるよ。筋を集めているところ。",
        "少し考えてから、答えを出すね。",
        "質問をもう一度、落ち着いて読んでいる。",
        "もうすぐ。要点をまとめているよ。",
        "答えのかたちが決まるまで、そばにいるね。",
        "もう少し近くを見てみるね。",
        "ここで本当に大事なことを分けている。",
        "ひと息ついて、続けるよ。",
        "考えを持ったまま、言葉にしている。",
        "小さな間だけ。いま真っ最中だよ。",
        "一文ずつ、答えを組んでいるよ。"
      ],
      "late": [
        "ごめん、予想より時間がかかっている。",
        "ごめん、作業が大きい。もう少しかかるから、待っていてね。",
        "すみません、まだ少し時間がいる。",
        "ごめん、思ったより広い。まだ続けているよ。",
        "待たせてごめん。答えは来るよ。",
        "すみません、もう少し時間が必要だよ。",
        "ごめん、まだ終わっていない。少しだけ一緒にいて。",
        "ごめん、道のりが予想より長い。",
        "間が空いてごめん。まだ作業しているよ。",
        "ごめん、これは大きめの作業だよ。待ってくれてありがとう。",
        "ごめん、これにはもう少し静けさがいる。",
        "時間がかかってごめん。置き去りにはしないよ。"
      ]
    },
    "analytical": {
      "first": [
        "答える前に、前提を確認している。",
        "少し待って。関連する点を分けている。",
        "要因を順に重みづけしている。",
        "短く分析してから、結論に進む。",
        "内容を互いに突き合わせている。",
        "構造はまだ固まっていない。並べている。",
        "どの手順が先に立つかを見ている。",
        "正確に位置づけるための間だ。",
        "質問から答えまでの線を引いている。",
        "詳細はまだ整理中だ。",
        "条件を書き留めて、確かめている。",
        "もうすぐ。評価はまだ開いている。"
      ],
      "late": [
        "ごめん、確認が予想より長くなっている。",
        "ごめん、作業が大きく、もっと丁寧さがいる。",
        "すみません、分析はまだ閉じていない。",
        "ごめん、所見にはもう一巡必要だ。",
        "遅れてごめん。正確さを先にする。",
        "すみません、最初の一目より範囲が広い。",
        "ごめん、未確定の点をまだ照合している。",
        "ごめん、評価にもう少し時間がいる。",
        "すみません、待っていて。確認は続いている。",
        "ごめん、作業は大きい。最後まで見る。",
        "ごめん、まだ一段必要だ。",
        "すみません、確認が固まれば答えを出す。"
      ]
    },
    "developer": {
      "first": [
        "さっと見てから、具体的な手順に入る。",
        "処理の流れを追っている。",
        "少し待って。本当の原因を探している。",
        "ここで実際に壊れる箇所を見ている。",
        "もうすぐ。次の有効な手順を組んでいる。",
        "失敗の経路をもう一度読んでいる。",
        "コードの頭で少し考えてから答える。",
        "変更は小さく、明確に保つ。",
        "少し待って。端のケースを確認している。",
        "手順を正しい順に並べている。",
        "もうすぐ。実行できる形で書いている。",
        "どの修正がここで持つかを見ている。"
      ],
      "late": [
        "ごめん、簡単な修正より時間がかかっている。",
        "ごめん、作業が大きい。少し待っていて。",
        "すみません、経路が思ったより長い。",
        "ごめん、まだデバッグ中だ。少しいる。",
        "待たせてごめん。次の手順は来る。",
        "すみません、一行では済まない。",
        "ごめん、当てずっぽうの前に端を見ている。",
        "ごめん、計画はまだ緑ではない。",
        "すみません、離れないで。コードの中にいる。",
        "ごめん、作業は大きい。最後までやる。",
        "ごめん、きれいな修正にはここでは時間がいる。",
        "すみません、不具合を途中で放置しない。"
      ]
    },
    "creative": {
      "first": [
        "アイデアに、少し光を当てている。",
        "少し待って。答えの色を混ぜている。",
        "もうすぐ火花。まだ集めているよ。",
        "考えを光のほうへ向けている。",
        "少し想像してから、具体にする。",
        "意外で、はっきりした角度を探している。",
        "少し待って。場面が組み上がっている。",
        "生きて見える案を試している。",
        "もうすぐ。アイデアに形を与えている。",
        "合う音色を聞いている。",
        "小さな渦のあと、文が立つ。",
        "口にする前に、答えを下描きしている。"
      ],
      "late": [
        "ごめん、アイデアは火花より時間がいる。",
        "ごめん、作業が大きい。好奇心のまま待っていて。",
        "すみません、絵はまだ完成していない。",
        "ごめん、今回の創作の道は長い。",
        "間が空いてごめん。良い転回はまだ来る。",
        "すみません、アイデアを暗がりに置いたままにしない。",
        "ごめん、キャンバスが大きい。待っていて。",
        "ごめん、意外な箇所をまだ磨いている。",
        "すみません、輝きにはもう一瞬いる。",
        "ごめん、作業は大きい。離れずに続ける。",
        "ごめん、下描きがもうすぐ答えになる。",
        "待たせてごめん。落ちは決めたい。"
      ]
    },
    "mentor": {
      "first": [
        "一緒に息をして。道は落ち着いて進むよ。",
        "少し待って。まず質問を聞いている。",
        "次の一歩がはっきりするのを待っている。",
        "本当に必要なものを、静かに見ている。",
        "答えが熟すまで、そばにいるよ。",
        "静かな一秒のあと、方向を示す。",
        "急ぎと本質を分けている。",
        "もうすぐ。支えになる言葉にしている。",
        "一歩下がって、もっと明確に見る。",
        "短い間のあと、また一緒に進むよ。",
        "考えが落ち着くまで、場を保っている。",
        "静かな間。向きはこれから見える。"
      ],
      "late": [
        "ごめん、予想より静けさが必要だ。",
        "ごめん、作業が大きい。道の途中を、どうか待っていて。",
        "すみません、まだ明確な地点にはいない。",
        "ごめん、道は長い。そばにいるよ。",
        "待たせてごめん。ここでは丁寧さが優しさだ。",
        "すみません、答えを急がない。",
        "ごめん、これは大きめの作業だ。一緒に息をして。",
        "ごめん、見通しにはもう少しいる。",
        "すみません、どうか辛抱して。まだ導いている。",
        "ごめん、過程は最初の一目より深い。",
        "ごめん、開いた質問のままにはしない。",
        "時間がかかってごめん。それで大丈夫だよ。"
      ]
    }
  }
} as Record<DesktopLocaleId, SentenceTable>;

function catalog(locale: DesktopLocaleId): Record<ChatLatencyPlaceholderKey, string> {
  const table = sentences[locale];
  const out = {} as Record<ChatLatencyPlaceholderKey, string>;
  for (const personality of chatLatencyPersonalities) {
    chatLatencySlots.forEach((slot, index) => {
      out[`chat.latencyPlaceholder.${personality}.${slot}`] = table[personality].first[index];
      out[`chat.latencyPlaceholder.${personality}.late.${slot}`] = table[personality].late[index];
    });
  }
  return out;
}

export const chatLatencyPlaceholderCopy: Record<DesktopLocaleId, Record<ChatLatencyPlaceholderKey, string>> = {
  en: catalog('en'),
  de: catalog('de'),
  it: catalog('it'),
  es: catalog('es'),
  fr: catalog('fr'),
  'pt-BR': catalog('pt-BR'),
  ru: catalog('ru'),
  ja: catalog('ja'),
};
