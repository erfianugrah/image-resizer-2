Transformation	IMQuery string
Append	Syntax:
?im=Append,image=(url=<url_to_appended_image>)
Example:
https://www.example.com/image.jpg?im=Append,image=(url=https://www.example.com/image2.jpg)
Aspect Crop	Syntax:
?im=AspectCrop,(width,height),xPosition=<horizontal_position>,yPosition=<vertical_position>
Examples:
To center the cropped area while changing the image to achieve the requested aspect ratio:
https://www.example.com/image.jpg?im=AspectCrop=(1,3),xPosition=.5,yPosition=.5
Background Color	Syntax:
?im=BackgroundColor,color=<hex_color_value>
Example:
https://www.example.com/image.jpg?im=BackgroundColor,color=00ff00
Blur	Syntax:
?im=Blur
Examples:
https://www.example.com/image.jpg?im=Blur

To specify the blur strength:
https://www.example.com/image.jpg?im=Blur=2
Composite (Watermark)	Syntax:
?im=Composite,image=(url=<url_to_the_image_text_or_shape>)
Example:
https://www.example.com/image.jpg?im=Composite,image=(url=https://www.example.com/image2.jpg)
Contrast	Syntax:
?im=Contrast,contrast=<contrast_level>
Example:
https://www.example.com/image.jpg?im=Contrast,contrast=0.5
Crop	Syntax:
?im=Crop,width=<width_to_crop>,height=<height_to_crop>
Examples:
https://www.example.com/image.jpg?im=Crop,width=150,height=100

To apply the Crop transformation using the size shortcut:
https://www.example.com/image.jpg?im=Crop,size=(150,100)

To apply the Crop transformation using the rect shortcut for xPosition, yPosition, width, and height. We've also included the gravity parameter to specify the placement or region of the crop within the image:
https://www.example.com/image.jpg?im=Crop,rect=(0,0,100,100),gravity=Center

To use the Allow Expansion setting, add the parameter name without any equal sign or value:
https://www.example.com/image.jpg?im=Crop,size(150,100),allowExpansion
Face Crop	Syntax:
?im=FaceCrop
Examples:
https://www.example.com/image.jpg?im=FaceCrop

To apply the deep neural network algorithm:

https://www.example.com/image.jpg?im=FaceCrop,algorithm=dnn
Feature Crop	Syntax:
?im=FeatureCrop,width=<width_to_crop>,height=<height_to_crop>
Examples:
https://www.example.com/image.jpg?im=FeatureCrop,width=500,height=200

To apply Feature Crop using a shortcut:
https://www.example.com/image.jpg?im=FeatureCrop,size=(500,200)
Fit and Fill	Syntax:
?im=FitAndFill,width=<resized_width>,height<resized_height>
Examples:
https://www.example.com/image.jpg?im=FitAndFill,width=400,height=500

To apply Fit and Fill using a shortcut:
https://www.example.com/image.jpg?im=FitAndFill=(400,500)
Goop	Syntax:
?im=Goop
Example:
https://www.example.com/image.jpg?im=Goop
Grayscale	Syntax:
?im=Grayscale
Example:
https://www.example.com/image.jpg?im=Grayscale
Hue/Saturation/Lightness	Syntax:
?im=HSL,hue=<hue_value>,saturation=<saturation_value>,lightness=<lightness_value>
Example:
https://www.example.com/image.jpg?im=HSL,hue=1,saturation=1.5,lightness=1.5
Hue/Saturation/Value	Syntax:
?im=HSV,hue=<hue_value>,saturation=<saturation_value>,value<lightness_or_darkness_value>
Example:
https://www.example.com/image.jpg?im=HSV,hue=0.5,saturation=2,value=1
Max Colors	Syntax:
?im=Maxcolors,colors=<number_of_colors>
Example:
https://www.example.com/image.jpg?im=MaxColors,colors=35
Mirror	Syntax:
?im=Mirror,horizontal
Example:
https://www.example.com/image.jpg?im=Mirror,horizontal
Opacity	Syntax:
?im=Opacity=<opacity_value>
Example:
https://www.example.com/image.jpg?im=Opacity=0.5
Region of Interest Crop	Syntax:
?im=RegionOfInterestCrop,width=<roi_width_value>,height=<roi_height_value>,regionOfInterest=width=<width_value>,height=<height_value>
Examples:
https://www.example.com/image.jpg?im=RegionOfInterestCrop,width=400,height=300,regionOfInterest=(150,200)

To apply RegionOfInterestCrop using a shortcut:
https://www.example.com/image.jpg?im=RegionOfInterestCrop=(400,300),regionOfInterest=(150,200)
Relative Crop	Syntax:
?im=RelativeCrop,north=<north_value>,south=<south_value>
Example:
https://www.example.com/image.jpg?im=RelativeCrop,north=10,south=10
Resize	Syntax:
?im=Resize,width=<resized_width>,height=<resized_height>
Examples:
https://www.example.com/image.jpg?im=Resize,width=250,height=125

To apply the Resize transformation using a shortcut:
https://www.example.com/image.jpg?im=Resize=(250,125)
Rotate	Syntax:
?im=Rotate,degrees=<rotate_degrees>
Example:
https://www.example.com/image.jpg?im=Rotate,degrees=13
Scale	Syntax:
?im=Scale,width=<width_value>,height=<height_value>
Example:
https://www.example.com/image.jpg?im=Scale,width=0.5,height=0.5
Shear	Syntax:
?im=Shear,xShear=<xShear_value>,yShear=<yShear_value>
Example:
https://www.example.com/image.jpg?im=Shear,xShear=0.1,yShear=0.1
Smart Crop	Syntax:
?im=SmartCrop,width=<widthto_crop>,height=<height_to_crop>
Examples:
https://www.example.com/image.jpg?im=SmartCrop,width=500,height=200

To apply Smart Crop using a shortcut:
https://www.example.com/image.jpg?im=SmartCrop,size=(500,200)
Trim	Syntax:
?im=Trim,fuzz=<fuzz_value>,padding=<padding_value>
Example:
https://www.example.com/image.jpg?im=Trim,fuzz=0.5,padding=20
Unsharp Mask	Syntax:
?im=UnsharpMask,gain=<mask_value>,threshold=<threshold_value>
Example:
https://www.example.com/image.jpg?im=UnsharpMask,gain=2.0,threshold=0.08
