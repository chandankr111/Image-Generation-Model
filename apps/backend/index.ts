import express from "express"
import {TrainModel , GenerateImage , GenerateImagesFromPack } from "common/types"
import { prismaClient } from "db1"


 const PORT = process.env.PORT || 8080 ;
 console.log(process.env.FAL_KEY);
const app = express();
app.use(express.json());
const USER_ID =  "123"
app.post("/ai/training" , async(req ,res) =>{
    try {
        const parsedBody = TrainModel.safeParse(req.body);
        if (!parsedBody.success) {
          res.status(411).json({
            message: "Input incorrect",
            error: parsedBody.error,
          });
          return;
        }
    
    
    
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
            // falAiRequestId: request_id,
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
    
})

app.post("/ai/generate" , async(req ,res) =>{
    
 const parsedBody = GenerateImage.safeParse(req.body)

 if(!parsedBody.success){
    res.status(411).json({
        message : "Input incorrect"
    })
    return
 }
 const data = await prismaClient.outputImages.create({
    data : {
        prompt: parsedBody.data.prompt,
        userId: USER_ID,
        modelId: parsedBody.data.modelId,
        imageUrl: "",
        // falAiRequestId: request_id,
    }
 })
    
})

app.post("/ai/pack/generate" , async(req ,res) =>{
    const parsedBody = GenerateImagesFromPack.safeParse(req.body)

    if(!parsedBody.success){
        res.status(411).json({
            message : "Input incorrect"
        })
        return;
    }
    const prompts = await prismaClient.packPrompts.findMany({
        where: {
            packId: parsedBody.data.packId
        }
    })
    const images = await prismaClient.outputImages.createMany({
        data: prompts.map((prompt: { prompt: string }) => ({
            prompt: prompt.prompt,
            userId: USER_ID,
            modelId: parsedBody.data.modelId,
            imageUrl: "",
            // falAiRequestId: request_id,
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

app.listen(PORT , ()=>{
    console.log( `server is running ${PORT}`);
} );