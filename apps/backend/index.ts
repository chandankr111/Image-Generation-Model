import express from "express"
import {TrainModel , GenerateImage , GenerateImagesFromPack } from "common/types"
import { prismaClient } from "db1"
import { fal } from "@fal-ai/client"
import { S3Client } from "bun";
import { FalAIModel } from "./models/FalAIModel"
import cors from "cors";

const PORT = process.env.PORT || 8080;
console.log(process.env.FAL_KEY);
const app = express();
app.use(express.json());
const USER_ID = "123"
app.use(cors());
const falAiModel = new FalAIModel();

// Configure S3 client for R2

app.get("/pre-signed-url", async (req, res) => {
  const key = `models/${Date.now()}_${Math.random()}.zip`;
  const url = S3Client.presign(key, {
    method: "PUT",
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
    endpoint: process.env.ENDPOINT,
    bucket: process.env.BUCKET_NAME,
    expiresIn: 60 * 5,
    type: "application/zip",
  });

  res.json({
    url,
    key,
  });
});

app.post("/ai/training",  async (req, res) => {
  try {
    const parsedBody = TrainModel.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(411).json({
        message: "Input incorrect",
        error: parsedBody.error,
      });
      return;
    }
    const { request_id, response_url } = await falAiModel.trainModel(
      parsedBody.data.zipUrl,
      parsedBody.data.name
    );

    const data = await prismaClient.model.create({
      data: {
        name: parsedBody.data.name,
        type: parsedBody.data.type,
        age: parsedBody.data.age,
        ethinicity: parsedBody.data.ethinicity,
        eyeColor: parsedBody.data.eyeColor,
        bald: parsedBody.data.bald,
        userId: USER_ID,
        zipUrl: parsedBody.data.zipUrl,
        falAiRequestId: request_id,
      },
    });

    res.json({
      modelId: data.id,
    });
  } catch (error) {
    console.error("Error in /ai/training:", error);
    res.status(500).json({
      message: "Training failed",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});


app.post("/ai/generate",  async (req, res) => {
  const parsedBody = GenerateImage.safeParse(req.body);

  if (!parsedBody.success) {
    res.status(411).json({});
    return;
  }

  const model = await prismaClient.model.findUnique({
    where: {
      id: parsedBody.data.modelId,
    },
  });

  if (!model || !model.tensorPath) {
    res.status(411).json({
      message: "Model not found",
    });
    return;
  }
  // check if the user has enough credits

  const credits = await prismaClient.userCredit.findUnique({
    where: {
      userId: USER_ID,
    },
  });

  // if ((credits?.amount ?? 0) < IMAGE_GEN_CREDITS) {
  //   res.status(411).json({
  //     message: "Not enough credits",
  //   });
  //   return;
  // }

  const { request_id, response_url } = await falAiModel.generateImage(
    parsedBody.data.prompt,
    model.tensorPath
  );

  const data = await prismaClient.outputImages.create({
    data: {
      prompt: parsedBody.data.prompt,
      userId: USER_ID,
      modelId: parsedBody.data.modelId,
      imageUrl: "",
      falAiRequestId: request_id,
    },
  });

  // await prismaClient.userCredit.update({
  //   where: {
  //     userId: req.userId!,
  //   },
  //   data: {
  //     amount: { decrement: IMAGE_GEN_CREDITS },
  //   },
  // });

  res.json({
    imageId: data.id,
  });
});

app.post("/pack/generate" , async(req ,res) =>{
    const parsedBody = GenerateImagesFromPack.safeParse(req.body)

    if(!parsedBody.success){
        res.status(411).json({
            message : "Input incorrect"
        })
        return;
    }
  

    const model = await prismaClient.model.findFirst({
      where: {
        id: parsedBody.data.modelId,
      },
    });
  
    if (!model) {
      res.status(411).json({
        message: "Model not found",
      });
      return;
    }

    const prompts = await prismaClient.packPrompts.findMany({
        where: {
            packId: parsedBody.data.packId
        }
    });

    let requestIds: { request_id: string }[] = await Promise.all(
      prompts.map((prompt) =>
        falAiModel.generateImage(prompt.prompt, model.tensorPath!)
      )
    );
  

    const images = await prismaClient.outputImages.createMany({
        data: prompts.map((prompt: { prompt: string } , index) => ({
            prompt: prompt.prompt,
            userId: USER_ID,
            modelId: parsedBody.data.modelId,
            imageUrl: "",
            falAiRequestId: requestIds[index].request_id,
        }))

    })
    res.json({
        count: images.count
    })
})

app.get("/pack/bulk" , async(req , res)=>{

     const packs = await prismaClient.packs.findMany({})

     res.json({
        packs
     })

} )


app.get("/image/bulk" , async(req , res)=>{
  const ids = req.query.images as string[]
  const limit = req.query.limit as string ?? "10";
  const offset = req.query.offset as string ?? "0";
  const imagesData = await prismaClient.outputImages.findMany({
    where: {
        id: {
            in: ids
        },

        userId: USER_ID
    },
    skip: parseInt(offset),
    take: parseInt(limit)
  })
  res.json({
    images: imagesData
  })
})

// app.post("/fal-ai/webhook" , async(req , res)=>{
//     const parsedBody = req.body;
//     console.log(parsedBody);
//     res.json({
//         message: "Webhook received"
//     })
// })

app.post("/fal-ai/webhook/train", async (req, res) => {
  console.log("====================Received training webhook====================");
  console.log("Received training webhook:", req.body);
  const requestId = req.body.request_id as string;

  // First find the model to get the userId
  const model = await prismaClient.model.findFirst({
    where: {
      falAiRequestId: requestId,
    },
  });

  console.log("Found model:", model);

  if (!model) {
    console.error("No model found for requestId:", requestId);
    res.status(404).json({ message: "Model not found" });
    return;
  }

  // Handle error case
  if (req.body.status === "ERROR") {
    console.error("Training error:", req.body.error);
    await prismaClient.model.updateMany({
      where: {
        falAiRequestId: requestId,
      },
      data: {
        trainingStatus: "Failed",
      },
    });
    
    res.json({
      message: "Error recorded",
    });
    return;
  }

  // Check for both "COMPLETED" and "OK" status
  if (req.body.status === "COMPLETED" || req.body.status === "OK") {
    try {
      // Check if we have payload data directly in the webhook
      let loraUrl;
      if (req.body.payload && req.body.payload.diffusers_lora_file && req.body.payload.diffusers_lora_file.url) {
        // Extract directly from webhook payload
        loraUrl = req.body.payload.diffusers_lora_file.url;
        console.log("Using lora URL from webhook payload:", loraUrl);
      } else {
        // Fetch result from fal.ai if not in payload
        console.log("Fetching result from fal.ai");
        const result = await fal.queue.result("fal-ai/flux-lora-fast-training", {
          requestId,
        });
        console.log("Fal.ai result:", result);
        const resultData = result.data as any;
        loraUrl = resultData.diffusers_lora_file.url;
      }

      // check if the user has enough credits
      const credits = await prismaClient.userCredit.findUnique({
        where: {
          userId: model.userId,
        },
      });

      console.log("User credits:", credits);

      // if ((credits?.amount ?? 0) < TRAIN_MODEL_CREDITS) {
      //   console.error("Not enough credits for user:", model.userId);
      //   res.status(411).json({
      //     message: "Not enough credits",
      //   });
      //   return;
      // }

      console.log("Generating preview image with lora URL:", loraUrl);
      const { imageUrl } = await falAiModel.generateImageSync(loraUrl);

      console.log("Generated preview image:", imageUrl);

      await prismaClient.model.updateMany({
        where: {
          falAiRequestId: requestId,
        },
        data: {
          trainingStatus: "Generated",
          tensorPath: loraUrl,
          thumbnail: imageUrl,
        },
      });

      // await prismaClient.userCredit.update({
      //   where: {
      //     userId: model.userId,
      //   },
      //   data: {
      //     amount: { decrement: TRAIN_MODEL_CREDITS },
      //   },
      // });

      // console.log("Updated model and decremented credits for user:", model.userId);
    } catch (error) {
      console.error("Error processing webhook:", error);
      await prismaClient.model.updateMany({
        where: {
          falAiRequestId: requestId,
        },
        data: {
          trainingStatus: "Failed",
        },
      });
    }
  } else {
    // For any other status, keep it as Pending
   
    await prismaClient.model.updateMany({
      where: {
        falAiRequestId: requestId,
      },
      data: {
        trainingStatus: "Pending",
      },
    });
  }

  res.json({
    message: "Webhook processed successfully",
  });
});

app.post("/fal-ai/webhook/image", async (req, res) => {
 
  // update the status of the image in the DB
  const requestId = req.body.request_id;

  // if (req.body.status === "ERROR") {
  //   res.status(411).json({});
  //   prismaClient.outputImages.updateMany({
  //     where: {
  //       falAiRequestId: requestId,
  //     },
  //     data: {
  //       status: "Failed",
  //       imageUrl: req.body.payload.images[0].url,
  //     },
  //   });
  //   return;
  // }

  await prismaClient.outputImages.updateMany({
    where: {
      falAiRequestId: requestId,
    },
    data: {
      status: "Generated",
      imageUrl: req.body.payload.images[0].url,
    },
  });

  res.json({
    message: "Webhook received",
  });
});

app.listen(PORT , ()=>{
    console.log( `server is running ${PORT}`);
} );