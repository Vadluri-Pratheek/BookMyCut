import {v2 as cloudinary} from "cloudinary"
import fs from "fs"


cloudinary.config({
    cloud_name : process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadOnCloudinary = async (loclaFilePath)=>{
    try {
        if (!loclaFilePath) return null
        const response = await cloudinary.uploader.upload(loclaFilePath,{
            resource_type:"auto"
        })
        console.log("Image is uploaded on cloudinary",response.url);
        return response
    } catch (error) {
        fs.unlinkSync(loclaFilePath)
        return null;
    }
}

export {uploadOnCloudinary};
