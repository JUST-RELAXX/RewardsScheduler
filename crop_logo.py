import sys
from PIL import Image

def crop_transparent(image_path, output_png_path, output_ico_path):
    img = Image.open(image_path).convert("RGBA")
    
    # Get the bounding box of non-transparent content
    bbox = img.getbbox()
    
    if bbox:
        # Crop the image to the bounding box
        cropped = img.crop(bbox)
        
        # Make the image square to prevent stretching
        width, height = cropped.size
        size = max(width, height)
        
        # Create a new transparent square image
        square_img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        
        # Paste the cropped image into the center
        offset = ((size - width) // 2, (size - height) // 2)
        square_img.paste(cropped, offset)
        
        # Save as PNG
        square_img.save(output_png_path, format="PNG")
        
        # Save as ICO with multiple sizes for best Windows compatibility
        icon_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
        square_img.save(output_ico_path, format="ICO", sizes=icon_sizes)
        print("Success")
    else:
        print("Error: Image is completely transparent")

if __name__ == "__main__":
    crop_transparent(sys.argv[1], sys.argv[2], sys.argv[3])
