const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });

admin.initializeApp();

exports.incrementTreeCounter = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const apiKey = req.headers["x-api-key"];
    if (apiKey !== "CLAVE_SEGURA_GENFORES") {
      res.status(401).send("Acceso denegado");
      return;
    }

    // Se espera que el cuerpo de la petición tenga la información de la reunión
    const meetingData = req.body.meeting;
    if (!meetingData) {
      res.status(400).send("No se proporcionó la información de la reunión.");
      return;
    }

    // Referencia al documento del contador global
    const treesRef = admin.firestore().doc("globalCounters/treesCounter");

    try {
      // Incrementa el contador en 1
      await treesRef.set(
        { trees: admin.firestore.FieldValue.increment(1) },
        { merge: true }
      );

      // Recupera el nuevo valor del contador
      const docSnap = await treesRef.get();
      const treesCount = docSnap.data().trees;

      // Crea un nuevo documento en la colección "meetingRecords"
      // Aquí cada reunión (representada por un "árbol") se almacena junto con el contador actual
      const meetingDocRef = admin.firestore().collection("meetingRecords").doc();
      await meetingDocRef.set({
        ...meetingData,
        counter: treesCount,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      res.status(200).json({
        success: true,
        currentCount: treesCount,
        meetingId: meetingDocRef.id
      });
    } catch (error) {
      console.error("Error al incrementar contador y crear reunión:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
});
